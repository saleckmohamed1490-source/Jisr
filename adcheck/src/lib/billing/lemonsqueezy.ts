import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { WebhookSignatureError, type BillingEvent, type BillingProvider } from "./types";

const API = "https://api.lemonsqueezy.com/v1";

function apiHeaders() {
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
  };
}

type LsPayload = {
  meta?: { event_name?: string; custom_data?: { user_id?: string } };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      status?: string;
      renews_at?: string | null;
      ends_at?: string | null;
      customer_id?: number | string;
      subscription_id?: number | string;
      urls?: { customer_portal?: string };
    };
  };
};

const date = (v?: string | null) => (v ? new Date(v) : null);

export const lemonSqueezyProvider: BillingProvider = {
  name: "lemonsqueezy",

  isConfigured() {
    return Boolean(
      process.env.LEMONSQUEEZY_API_KEY &&
        process.env.LEMONSQUEEZY_STORE_ID &&
        process.env.LEMONSQUEEZY_VARIANT_ID &&
        process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
    );
  },

  async createCheckout({ userId, email, successUrl }) {
    const res = await fetch(`${API}/checkouts`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { ...(email ? { email } : {}), custom: { user_id: userId } },
            product_options: { redirect_url: successUrl },
          },
          relationships: {
            store: { data: { type: "stores", id: String(process.env.LEMONSQUEEZY_STORE_ID) } },
            variant: { data: { type: "variants", id: String(process.env.LEMONSQUEEZY_VARIANT_ID) } },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Lemon Squeezy checkout error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: { attributes?: { url?: string } } };
    const url = json.data?.attributes?.url;
    if (!url) throw new Error("Lemon Squeezy returned no checkout URL");
    return url;
  },

  async parseWebhook(rawBody, headers) {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
    const signature = headers.get("x-signature") ?? "";
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookSignatureError("Invalid Lemon Squeezy signature");
    }

    const payload = JSON.parse(rawBody) as LsPayload;
    const eventName = payload.meta?.event_name ?? headers.get("x-event-name") ?? "";
    const attrs = payload.data?.attributes ?? {};
    const base = {
      // Lemon Squeezy re-sends the exact same body on retries, so its hash is a stable id.
      eventId: `lemonsqueezy:${createHash("sha256").update(rawBody).digest("hex")}`,
      userId: payload.meta?.custom_data?.user_id ?? null,
      raw: payload,
    };

    switch (eventName) {
      // Fired for the first payment and every renewal; data is a subscription invoice.
      case "subscription_payment_success":
        return [
          {
            ...base,
            type: "period_paid",
            subscriptionId: String(attrs.subscription_id ?? ""),
            customerId: attrs.customer_id != null ? String(attrs.customer_id) : null,
            status: "active",
          },
        ];

      // Data is the subscription itself.
      case "subscription_created":
      case "subscription_updated":
      case "subscription_cancelled":
      case "subscription_resumed":
      case "subscription_paused":
      case "subscription_unpaused":
      case "subscription_plan_changed":
      case "subscription_expired": {
        const event: BillingEvent = {
          ...base,
          type: eventName === "subscription_expired" || attrs.status === "expired" ? "subscription_ended" : "subscription_updated",
          subscriptionId: String(payload.data?.id ?? ""),
          customerId: attrs.customer_id != null ? String(attrs.customer_id) : null,
          status: attrs.status ?? null,
          // While cancelled, access continues until ends_at.
          periodEnd: date(attrs.status === "cancelled" ? attrs.ends_at : attrs.renews_at),
          manageUrl: attrs.urls?.customer_portal ?? null,
        };
        return [event];
      }

      default:
        return []; // Not relevant to credits.
    }
  },

  async getManageUrl(subscriptionId) {
    const res = await fetch(`${API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: apiHeaders(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as LsPayload;
    return json.data?.attributes?.urls?.customer_portal ?? null;
  },
};

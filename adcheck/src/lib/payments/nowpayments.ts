import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isPaymentStatus,
  PaymentProviderError,
  WebhookSignatureError,
  type PaymentProvider,
  type PaymentUpdate,
} from "./types";

const PROD = "https://api.nowpayments.io/v1";
const SANDBOX = "https://api-sandbox.nowpayments.io/v1";

function baseUrl() {
  // NOWPAYMENTS_API_URL is only for tests (pointing at a fake server).
  return process.env.NOWPAYMENTS_API_URL || (process.env.NOWPAYMENTS_SANDBOX === "true" ? SANDBOX : PROD);
}

/** Recursively sort object keys (NOWPayments signs the JSON with sorted keys). */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

/** HMAC-SHA512 of the key-sorted JSON body, hex encoded, with the IPN secret. */
export function signIpnPayload(payload: unknown, secret: string): string {
  return createHmac("sha512", secret).update(JSON.stringify(sortKeysDeep(payload))).digest("hex");
}

export function verifyIpnSignature(rawBody: string, signature: string | null, secret: string): unknown {
  if (!secret) throw new WebhookSignatureError("NOWPAYMENTS_IPN_SECRET is not set");
  if (!signature) throw new WebhookSignatureError("missing x-nowpayments-sig");
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new WebhookSignatureError("body is not JSON");
  }
  const expected = Buffer.from(signIpnPayload(payload, secret), "utf8");
  const received = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new WebhookSignatureError("invalid signature");
  }
  return payload;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export const nowPaymentsProvider: PaymentProvider = {
  name: "nowpayments",

  isConfigured() {
    return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
  },

  async createInvoice(input) {
    const res = await fetch(`${baseUrl()}/invoice`, {
      method: "POST",
      headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: input.priceUsd,
        price_currency: "usd",
        ...(input.payCurrency ? { pay_currency: input.payCurrency } : {}),
        order_id: input.orderId,
        order_description: input.description,
        ipn_callback_url: input.ipnUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        partially_paid_url: input.partiallyPaidUrl,
        is_fixed_rate: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string | number; invoice_url?: string; message?: string };
    if (!res.ok || !json.invoice_url || json.id === undefined) {
      throw new PaymentProviderError(`NOWPayments invoice error ${res.status}: ${json.message ?? "no invoice_url"}`);
    }
    return { invoiceId: String(json.id), invoiceUrl: json.invoice_url };
  },

  parseWebhook(rawBody, headers): PaymentUpdate {
    const p = verifyIpnSignature(
      rawBody,
      headers.get("x-nowpayments-sig"),
      process.env.NOWPAYMENTS_IPN_SECRET ?? "",
    ) as Record<string, unknown>;

    const status = str(p.payment_status);
    if (!isPaymentStatus(status) || status === "pending") {
      throw new PaymentProviderError(`unknown payment_status ${status}`);
    }
    const orderId = str(p.order_id);
    if (!orderId) throw new PaymentProviderError("missing order_id");

    return {
      orderId,
      providerPaymentId: str(p.payment_id),
      providerInvoiceId: str(p.invoice_id),
      status,
      priceAmount: num(p.price_amount),
      priceCurrency: str(p.price_currency)?.toLowerCase() ?? null,
      payCurrency: str(p.pay_currency)?.toLowerCase() ?? null,
      payAmount: num(p.pay_amount),
      actuallyPaid: num(p.actually_paid),
      payAddress: str(p.pay_address),
      // The incoming transaction hash, when NOWPayments includes it.
      txHash: str(p.payin_hash),
      raw: p,
    };
  },
};

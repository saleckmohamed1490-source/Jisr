import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "./plans";
import type { BillingEvent } from "./types";

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Applies a normalized billing event. Provider-independent and idempotent:
 * each event id is stored once in billing_events; a replay is ignored.
 */
export async function applyBillingEvent(provider: string, event: BillingEvent): Promise<"applied" | "duplicate" | "skipped"> {
  const admin = createAdminClient();

  // Resolve the user: from custom data, or from a subscription we already know.
  let userId = event.userId;
  const { data: existing } = await admin
    .from("subscriptions")
    .select("user_id, current_period_end")
    .eq("provider", provider)
    .eq("provider_subscription_id", event.subscriptionId)
    .maybeSingle<{ user_id: string; current_period_end: string | null }>();
  userId ??= existing?.user_id ?? null;
  if (!userId || !event.subscriptionId) {
    console.warn("[billing] event without user/subscription, skipped", event.type, event.subscriptionId);
    return "skipped";
  }

  // Idempotency: record the event first; a unique violation means "seen before".
  const { error: dupError } = await admin.from("billing_events").insert({
    id: event.eventId,
    provider,
    event_type: event.type,
    user_id: userId,
    payload: event.raw,
  });
  if (dupError) {
    if (dupError.code === "23505") return "duplicate";
    throw dupError;
  }

  try {
    await applyToAccount(admin, provider, userId, event, existing);
  } catch (err) {
    // Forget the event so the provider's retry can apply it again.
    await admin.from("billing_events").delete().eq("id", event.eventId);
    throw err;
  }
  return "applied";
}

async function applyToAccount(
  admin: ReturnType<typeof createAdminClient>,
  provider: string,
  userId: string,
  event: BillingEvent,
  existing: { user_id: string; current_period_end: string | null } | null,
) {
  // Keep our copy of the subscription in sync.
  const row: Record<string, unknown> = {
    user_id: userId,
    provider,
    provider_subscription_id: event.subscriptionId,
    updated_at: new Date().toISOString(),
  };
  if (event.customerId) row.provider_customer_id = event.customerId;
  if (event.status) row.status = event.status;
  if (event.periodEnd) row.current_period_end = event.periodEnd.toISOString();
  if (event.manageUrl) row.manage_url = event.manageUrl;
  if (!existing && !event.status) row.status = "active";
  const { error: subError } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (subError) throw subError;

  if (event.type === "period_paid") {
    const renewAt =
      event.periodEnd ??
      (existing?.current_period_end && new Date(existing.current_period_end) > new Date()
        ? new Date(existing.current_period_end)
        : new Date(Date.now() + ONE_MONTH_MS));
    const { error } = await admin.rpc("grant_paid_period", {
      p_user: userId,
      p_check_credits: PLANS.pro.checksPerMonth,
      p_image_credits: PLANS.pro.imagesPerMonth,
      p_renew_at: renewAt.toISOString(),
    });
    if (error) throw error;
  } else if (event.type === "subscription_ended") {
    const { error } = await admin.rpc("downgrade_to_free", { p_user: userId });
    if (error) throw error;
  } else if (event.periodEnd && event.status === "active") {
    // e.g. renewal date moved: keep the date shown on the dashboard accurate.
    await admin
      .from("profiles")
      .update({ credits_renew_at: event.periodEnd.toISOString() })
      .eq("id", userId)
      .eq("plan", "pro");
  }
}

export type MySubscription = {
  provider: string;
  provider_subscription_id: string;
  status: string;
  current_period_end: string | null;
};

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/plans";

export type CreditKind = "check" | "image" | "appeal";

export type Profile = {
  id: string;
  email: string | null;
  plan: PlanId;
  check_credits: number;
  image_credits: number;
  /** null = unlimited */
  appeal_credits: number | null;
  credits_renew_at: string | null;
  locale: string;
};

export type Subscription = {
  plan: Exclude<PlanId, "free">;
  status: "active" | "expired";
  current_period_start: string;
  current_period_end: string;
  provider: string;
};

/** The signed-in user's profile (read through RLS). */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, plan, check_credits, image_credits, appeal_credits, credits_renew_at, locale")
    .maybeSingle();
  return (data as Profile) ?? null;
}

export async function getMySubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_start, current_period_end, provider")
    .maybeSingle();
  return (data as Subscription) ?? null;
}

/**
 * Atomically deducts one credit in the database. Returns false when the user
 * has none left. Never trust a balance sent by the browser.
 */
export async function consumeCredit(userId: string, kind: CreditKind): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("consume_credit", { p_user: userId, p_kind: kind });
  if (error) throw error;
  return data !== null;
}

/** Gives a credit back when the paid-for work failed. */
export async function refundCredit(userId: string, kind: CreditKind): Promise<void> {
  const { error } = await createAdminClient().rpc("refund_credit", { p_user: userId, p_kind: kind });
  if (error) console.error("[credits] refund failed", userId, kind, error);
}

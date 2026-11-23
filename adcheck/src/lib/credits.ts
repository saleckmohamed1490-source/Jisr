import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreditKind = "check" | "image";

export type Profile = {
  id: string;
  email: string | null;
  plan: "free" | "pro";
  check_credits: number;
  image_credits: number;
  credits_renew_at: string | null;
};

/** The signed-in user's profile (read through RLS). */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, plan, check_credits, image_credits, credits_renew_at")
    .maybeSingle();
  return (data as Profile) ?? null;
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

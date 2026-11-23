import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type Duration, type PaidPlanId } from "@/lib/plans";

/**
 * Grants/extends a paid plan (see extend_subscription in the migrations for
 * the exact rules). Used by payment webhooks and by the admin.
 * Returns the new end of the subscription.
 */
export async function extendSubscription(
  userId: string,
  plan: PaidPlanId,
  months: Duration,
  provider: string,
): Promise<Date> {
  const q = PLANS[plan];
  const { data, error } = await createAdminClient().rpc("extend_subscription", {
    p_user: userId,
    p_plan: plan,
    p_months: months,
    p_provider: provider,
    p_checks: q.checks,
    p_images: q.images,
    p_appeals: q.appeals,
  });
  if (error) throw error;
  return new Date(data as string);
}

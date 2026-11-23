/**
 * Single source of truth for plans, quotas and prices.
 * `null` means unlimited. Quotas are granted for each 30-day credit cycle.
 */
export const PLAN_IDS = ["free", "starter", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PaidPlanId = Exclude<PlanId, "free">;
export const PAID_PLANS: PaidPlanId[] = ["starter", "pro", "agency"];

export type PlanQuota = {
  /** USD per month. */
  priceUsd: number;
  checks: number;
  images: number;
  appeals: number | null;
  workspaces: number;
  /** Checks are "unlimited" for users, capped by a fair-use limit. */
  fairUseChecks: boolean;
};

export const PLANS: Record<PlanId, PlanQuota> = {
  // Free: 3 checks once, at sign-up (not renewed).
  free: { priceUsd: 0, checks: 3, images: 0, appeals: 0, workspaces: 1, fairUseChecks: false },
  starter: { priceUsd: 6, checks: 100, images: 25, appeals: 5, workspaces: 1, fairUseChecks: false },
  pro: { priceUsd: 19, checks: 1000, images: 100, appeals: null, workspaces: 1, fairUseChecks: true },
  agency: { priceUsd: 49, checks: 1000, images: 300, appeals: null, workspaces: 5, fairUseChecks: true },
};

export const DURATIONS = [1, 3, 12] as const;
export type Duration = (typeof DURATIONS)[number];

/** Credits renew every 30 days from activation, whatever the paid duration. */
export const CREDIT_CYCLE_DAYS = 30;

/** Yearly = 10 months' price (two months free). */
export function priceFor(plan: PaidPlanId, months: Duration): number {
  const monthly = PLANS[plan].priceUsd;
  return months === 12 ? monthly * 10 : monthly * months;
}

export function isPaidPlan(v: unknown): v is PaidPlanId {
  return typeof v === "string" && (PAID_PLANS as string[]).includes(v);
}

export function isDuration(v: unknown): v is Duration {
  return (DURATIONS as readonly number[]).includes(Number(v));
}

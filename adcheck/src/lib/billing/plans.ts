/** Single source of truth for what each plan gives. */
export const PLANS = {
  free: { checksOnSignup: 3, imagesPerMonth: 0 },
  pro: { priceUsd: 6, checksPerMonth: 100, imagesPerMonth: 25 },
} as const;

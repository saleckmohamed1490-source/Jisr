import "server-only";
import { lemonSqueezyProvider } from "./lemonsqueezy";
import type { BillingProvider } from "./types";

/**
 * Registered payment providers. To add USDT later, implement BillingProvider
 * (e.g. src/lib/billing/usdt.ts) and register it here; its webhook URL will be
 * /api/billing/webhook/<name>.
 */
const providers: Record<string, BillingProvider> = {
  [lemonSqueezyProvider.name]: lemonSqueezyProvider,
};

export function getBillingProvider(name?: string): BillingProvider | null {
  const key = name ?? process.env.BILLING_PROVIDER ?? "lemonsqueezy";
  return providers[key] ?? null;
}

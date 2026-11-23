import "server-only";
import { nowPaymentsProvider } from "./nowpayments";
import type { PaymentProvider } from "./types";

/**
 * Registered providers. Webhooks arrive at /api/webhooks/<name>.
 * To add card payments later: implement PaymentProvider (e.g. ./lemonsqueezy.ts)
 * and add it here.
 */
const providers: Record<string, PaymentProvider> = {
  [nowPaymentsProvider.name]: nowPaymentsProvider,
};

export function getPaymentProvider(name = process.env.PAYMENT_PROVIDER || "nowpayments"): PaymentProvider | null {
  return providers[name] ?? null;
}

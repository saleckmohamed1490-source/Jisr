/**
 * Provider-agnostic billing contract. Lemon Squeezy implements it today; a
 * USDT (crypto) provider can implement the same interface later — the credit
 * logic in service.ts never needs to change.
 */

export type BillingEventType =
  /** A period was paid (first payment or renewal): reset monthly credits. */
  | "period_paid"
  /** Subscription status/details changed (cancelled, past_due, resumed, new renewal date…). */
  | "subscription_updated"
  /** Access is over: downgrade to Free. */
  | "subscription_ended";

export type BillingEvent = {
  /** Unique per event, used for idempotency. */
  eventId: string;
  type: BillingEventType;
  /** Our Supabase user id, if the provider passed it back (custom data). */
  userId: string | null;
  subscriptionId: string;
  customerId?: string | null;
  status?: string | null;
  periodEnd?: Date | null;
  manageUrl?: string | null;
  raw: unknown;
};

export interface BillingProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns the hosted checkout URL to redirect the user to. */
  createCheckout(opts: { userId: string; email: string | null; successUrl: string }): Promise<string>;
  /** Verifies the signature and converts the payload. Throws WebhookSignatureError when invalid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<BillingEvent[]>;
  /** Fresh link to the provider's customer portal, when it has one. */
  getManageUrl?(subscriptionId: string): Promise<string | null>;
}

export class WebhookSignatureError extends Error {}

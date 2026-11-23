/**
 * Payment provider contract. NOWPayments (crypto) implements it today; a card
 * provider such as Lemon Squeezy can be added later by implementing the same
 * interface and registering it in ./index.ts — nothing else changes.
 */

export const PAYMENT_STATUSES = [
  "pending", // our own: invoice created, nothing received yet
  "waiting",
  "confirming",
  "confirmed",
  "sending",
  "partially_paid",
  "finished",
  "failed",
  "refunded",
  "expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Statuses after which nothing else is expected to happen. */
export const FINAL_STATUSES: PaymentStatus[] = ["finished", "failed", "refunded", "expired"];

export function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === "string" && (PAYMENT_STATUSES as readonly string[]).includes(v);
}

export type CreateInvoiceInput = {
  orderId: string;
  priceUsd: number;
  description: string;
  payCurrency?: string;
  successUrl: string;
  cancelUrl: string;
  partiallyPaidUrl: string;
  ipnUrl: string;
};

export type CreatedInvoice = { invoiceId: string; invoiceUrl: string };

/** A webhook converted to our own vocabulary. */
export type PaymentUpdate = {
  orderId: string;
  providerPaymentId: string | null;
  providerInvoiceId: string | null;
  status: PaymentStatus;
  priceAmount: number | null;
  priceCurrency: string | null;
  payCurrency: string | null;
  payAmount: number | null;
  actuallyPaid: number | null;
  payAddress: string | null;
  txHash: string | null;
  raw: unknown;
};

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice>;
  /** Verify the signature and parse. Must throw WebhookSignatureError when invalid. */
  parseWebhook(rawBody: string, headers: Headers): PaymentUpdate;
}

export class WebhookSignatureError extends Error {}
export class PaymentProviderError extends Error {}

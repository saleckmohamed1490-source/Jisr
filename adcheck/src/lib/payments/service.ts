import "server-only";
import { randomBytes } from "node:crypto";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, priceFor, type Duration, type PaidPlanId } from "@/lib/plans";
import { APP_NAME } from "@/lib/brand";
import { sendEmail } from "@/lib/email/send";
import { paymentConfirmedEmail } from "@/lib/email/templates";
import { getPaymentProvider } from "./index";
import { findCoin } from "./currencies";
import type { PaymentStatus, PaymentUpdate } from "./types";

export type PaymentRow = {
  id: string;
  invoice_number: number;
  user_id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  plan: PaidPlanId;
  months: Duration;
  price_usd: number;
  pay_currency: string | null;
  pay_amount: number | null;
  actually_paid: number | null;
  pay_address: string | null;
  payin_hash: string | null;
  invoice_url: string | null;
  status: PaymentStatus;
  activated_at: string | null;
  period_end: string | null;
  created_at: string;
};

export class CheckoutError extends Error {
  constructor(public code: "not_configured" | "invalid" | "provider") {
    super(code);
  }
}

function siteBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** e.g. "ac_m2k9x1_4f9c2a7d1e" — unique, unguessable, and readable in the provider's dashboard. */
function newOrderId() {
  return `ac_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
}

/**
 * Step 2 of the flow: create our `pending` payment row, then the provider
 * invoice, and return the URL to send the user to.
 */
export async function createCheckout(opts: {
  userId: string;
  plan: PaidPlanId;
  months: Duration;
  coin: string;
  locale: Locale;
}): Promise<string> {
  const provider = getPaymentProvider();
  if (!provider?.isConfigured()) throw new CheckoutError("not_configured");
  if (!findCoin(opts.coin)) throw new CheckoutError("invalid");

  const admin = createAdminClient();
  const orderId = newOrderId();
  const price = priceFor(opts.plan, opts.months);

  const { data: row, error } = await admin
    .from("payments")
    .insert({
      user_id: opts.userId,
      order_id: orderId,
      provider: provider.name,
      plan: opts.plan,
      months: opts.months,
      price_usd: price,
      pay_currency: opts.coin,
      status: "pending",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) throw error ?? new Error("insert failed");

  const page = (href: string) => siteBase() + getPathname({ href, locale: opts.locale });
  try {
    const invoice = await provider.createInvoice({
      orderId,
      priceUsd: price,
      description: `${APP_NAME} ${opts.plan} — ${opts.months} month(s)`,
      payCurrency: opts.coin,
      successUrl: page(`/billing/status?order=${orderId}`),
      partiallyPaidUrl: page(`/billing/status?order=${orderId}`),
      cancelUrl: page(`/billing/checkout?plan=${opts.plan}&months=${opts.months}&cancelled=1`),
      ipnUrl: `${siteBase()}/api/webhooks/${provider.name}`,
    });
    await admin
      .from("payments")
      .update({ provider_invoice_id: invoice.invoiceId, invoice_url: invoice.invoiceUrl, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return invoice.invoiceUrl;
  } catch (err) {
    console.error("[payments] invoice creation failed", err);
    await admin.from("payments").update({ status: "failed", note: "invoice creation failed" }).eq("id", row.id);
    throw new CheckoutError("provider");
  }
}

/** A later webhook must never move a payment back from a final state. */
function nextStatus(current: PaymentStatus, incoming: PaymentStatus): PaymentStatus {
  if (current === "finished" && incoming !== "refunded") return current;
  if (current === "refunded") return current;
  return incoming;
}

export type ApplyResult = "activated" | "updated" | "unknown_order" | "amount_mismatch" | "ignored";

/**
 * Steps 4-5: apply a verified webhook. Only `finished` activates, and only
 * once per payment (activate_payment is idempotent in the database).
 */
export async function applyPaymentUpdate(providerName: string, u: PaymentUpdate): Promise<ApplyResult> {
  const admin = createAdminClient();
  const { data: pay } = await admin
    .from("payments")
    .select("*")
    .eq("order_id", u.orderId)
    .eq("provider", providerName)
    .maybeSingle<PaymentRow>();

  await admin.from("payment_events").insert({
    payment_id: pay?.id ?? null,
    provider: providerName,
    provider_payment_id: u.providerPaymentId,
    status: u.status,
    payload: u.raw,
  });
  if (!pay) {
    console.warn("[payments] webhook for unknown order", u.orderId);
    return "unknown_order";
  }

  // A payment_id that already activated another order must never activate this one.
  if (u.providerPaymentId && pay.provider_payment_id && pay.provider_payment_id !== u.providerPaymentId && pay.activated_at) {
    return "ignored";
  }

  const status = nextStatus(pay.status, u.status);
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (u.providerPaymentId && !pay.activated_at) update.provider_payment_id = u.providerPaymentId;
  if (u.payCurrency) update.pay_currency = u.payCurrency;
  if (u.payAmount !== null) update.pay_amount = u.payAmount;
  if (u.actuallyPaid !== null) update.actually_paid = u.actuallyPaid;
  if (u.payAddress) update.pay_address = u.payAddress;
  if (u.txHash) update.payin_hash = u.txHash;

  const { error: upErr } = await admin.from("payments").update(update).eq("id", pay.id);
  if (upErr?.code === "23505") {
    // This provider payment_id already belongs to another order: never activate twice.
    await admin.from("payments")
      .update({ note: `duplicate provider payment_id ${u.providerPaymentId}`, updated_at: new Date().toISOString() })
      .eq("id", pay.id);
    console.error("[payments] duplicate payment_id", u.providerPaymentId, "for order", pay.order_id);
    return "ignored";
  }
  if (upErr) throw upErr;

  if (status !== "finished" || pay.activated_at) return "updated";

  // The signed amount must match what we asked for (never trust the order alone).
  const expected = Number(pay.price_usd);
  if (u.priceCurrency !== "usd" || u.priceAmount === null || u.priceAmount + 0.001 < expected) {
    // Not activated: show it as partially paid so the user contacts support and
    // the admin sees it among open payments (and can activate it manually).
    await admin
      .from("payments")
      .update({ status: "partially_paid", note: `amount mismatch: got ${u.priceAmount} ${u.priceCurrency}` })
      .eq("id", pay.id);
    console.error("[payments] amount mismatch", pay.order_id, u.priceAmount, u.priceCurrency, expected);
    return "amount_mismatch";
  }

  const q = PLANS[pay.plan];
  const { data: periodEnd, error } = await admin.rpc("activate_payment", {
    p_payment: pay.id,
    p_checks: q.checks,
    p_images: q.images,
    p_appeals: q.appeals,
  });
  if (error) throw error;
  if (!periodEnd) return "updated"; // someone else activated it first

  await sendConfirmation(pay, u, new Date(periodEnd as string));
  return "activated";
}

async function sendConfirmation(pay: PaymentRow, u: PaymentUpdate, periodEnd: Date) {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("email, locale")
      .eq("id", pay.user_id)
      .single<{ email: string | null; locale: string }>();
    if (!profile?.email) return;
    const email = await paymentConfirmedEmail(profile.email, profile.locale, {
      id: pay.id,
      invoiceNumber: pay.invoice_number,
      plan: pay.plan,
      months: pay.months,
      priceUsd: Number(pay.price_usd),
      payCurrency: u.payCurrency ?? pay.pay_currency,
      actuallyPaid: u.actuallyPaid,
      paidAt: new Date(),
      periodEnd,
    });
    await sendEmail(email);
  } catch (err) {
    // The subscription is active even if the e-mail fails.
    console.error("[payments] confirmation e-mail failed", err);
  }
}

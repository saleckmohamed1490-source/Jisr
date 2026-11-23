import "server-only";
import { getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { findCoin } from "@/lib/payments/currencies";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import { renderEmail } from "./layout";
import type { Email } from "./send";

function base() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
const url = (locale: Locale, href: string) => base() + getPathname({ href, locale });
const loc = (l: string | null | undefined): Locale => (isLocale(l) ? l : routing.defaultLocale);

export type PaidInvoice = {
  id: string;
  invoiceNumber: number;
  plan: string;
  months: number;
  priceUsd: number;
  payCurrency: string | null;
  actuallyPaid: number | null;
  paidAt: Date;
  periodEnd: Date;
};

export async function paymentConfirmedEmail(to: string, localeIn: string, inv: PaidInvoice): Promise<Email> {
  const locale = loc(localeIn);
  const t = await getTranslations({ locale, namespace: "emails" });
  const tp = await getTranslations({ locale, namespace: "plans" });
  const coin = findCoin(inv.payCurrency);
  const plan = tp(`${inv.plan as "pro"}.name`);
  const { html, text } = renderEmail({
    locale,
    title: t("paid.title"),
    blocks: [
      { type: "p", text: t("paid.body", { plan, date: formatDate(inv.periodEnd, locale) }) },
      {
        type: "table",
        rows: [
          [t("invoice.number"), `#${inv.invoiceNumber}`],
          [t("invoice.date"), formatDate(inv.paidAt, locale)],
          [t("invoice.plan"), `${plan} — ${t("invoice.months", { months: inv.months })}`],
          [t("invoice.amount"), formatUsd(inv.priceUsd, locale)],
          ...(coin && inv.actuallyPaid !== null
            ? ([[t("invoice.paidWith"), `${inv.actuallyPaid} ${coin.symbol} (${coin.network})`]] as [string, string][])
            : []),
          [t("invoice.validUntil"), formatDate(inv.periodEnd, locale)],
        ],
      },
      { type: "button", label: t("paid.viewInvoice"), href: url(locale, `/billing/invoices/${inv.id}`) },
      { type: "small", text: t("support", { email: SUPPORT_EMAIL }) },
    ],
    footer: t("footer", { app: APP_NAME }),
  });
  return { to, subject: t("paid.subject", { app: APP_NAME, number: inv.invoiceNumber }), html, text };
}

export async function renewalReminderEmail(
  to: string,
  localeIn: string,
  r: { plan: string; endsAt: Date; daysLeft: number },
): Promise<Email> {
  const locale = loc(localeIn);
  const t = await getTranslations({ locale, namespace: "emails" });
  const tp = await getTranslations({ locale, namespace: "plans" });
  const plan = tp(`${r.plan as "pro"}.name`);
  const { html, text } = renderEmail({
    locale,
    title: t("reminder.title", { days: r.daysLeft }),
    blocks: [
      { type: "p", text: t("reminder.body", { plan, date: formatDate(r.endsAt, locale) }) },
      { type: "button", label: t("reminder.cta"), href: url(locale, `/billing/checkout?plan=${r.plan}&months=1`) },
      { type: "small", text: t("reminder.note") },
    ],
    footer: t("footer", { app: APP_NAME }),
  });
  return { to, subject: t("reminder.subject", { app: APP_NAME, days: r.daysLeft }), html, text };
}

export async function expiredEmail(to: string, localeIn: string, r: { plan: string }): Promise<Email> {
  const locale = loc(localeIn);
  const t = await getTranslations({ locale, namespace: "emails" });
  const tp = await getTranslations({ locale, namespace: "plans" });
  const { html, text } = renderEmail({
    locale,
    title: t("expired.title"),
    blocks: [
      { type: "p", text: t("expired.body", { plan: tp(`${r.plan as "pro"}.name`) }) },
      { type: "button", label: t("reminder.cta"), href: url(locale, `/billing/checkout?plan=${r.plan}&months=1`) },
    ],
    footer: t("footer", { app: APP_NAME }),
  });
  return { to, subject: t("expired.subject", { app: APP_NAME }), html, text };
}

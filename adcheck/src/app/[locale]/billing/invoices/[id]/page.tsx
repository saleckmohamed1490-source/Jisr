import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyPayment } from "@/lib/data/payments";
import { explorerUrl, findCoin } from "@/lib/payments/currencies";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";

/** Printable receipt (browser "Save as PDF"). */
export default async function InvoicePage({ params }: PageProps<"/[locale]/billing/invoices/[id]">) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const user = await getUser();
  if (!user) return redirect({ href: `/login?next=/billing/invoices/${id}`, locale });
  const p = await getMyPayment(id);
  if (!p || p.status !== "finished") notFound();

  const [t, ts, tp] = await Promise.all([getTranslations("invoice"), getTranslations("paymentStatus"), getTranslations("plans")]);
  const coin = findCoin(p.pay_currency);
  const tx = explorerUrl(p.pay_currency, p.payin_hash);
  const issued = p.activated_at ?? p.created_at;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-4 flex justify-end print:hidden"><PrintButton label={t("print")} /></div>
      <article className="rounded-xl border bg-white p-8 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-6">
          <div><Logo /><p className="mt-2 text-xs text-muted-foreground">{SUPPORT_EMAIL}</p></div>
          <div className="text-end">
            <h1 className="text-xl font-bold">{t("title", { number: p.invoice_number })}</h1>
            <p className="text-sm text-muted-foreground">{t("issued", { date: formatDate(issued, locale) })}</p>
            <p className="text-sm">{t("status")}: <strong>{ts(p.status)}</strong></p>
          </div>
        </header>
        <section className="py-6 text-sm">
          <p className="text-muted-foreground">{t("billedTo")}</p>
          <p className="font-medium" dir="ltr">{user.email}</p>
        </section>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-muted-foreground"><th className="py-2 text-start font-medium">{t("description")}</th><th className="py-2 text-end font-medium">{t("total")}</th></tr></thead>
          <tbody>
            <tr className="border-b"><td className="py-3">{APP_NAME} — {t("line", { plan: tp(`${p.plan}.name`), months: p.months })}</td><td className="py-3 text-end" dir="ltr">{formatUsd(Number(p.price_usd), locale)}</td></tr>
          </tbody>
          <tfoot><tr><td className="py-3 font-semibold">{t("total")}</td><td className="py-3 text-end text-lg font-bold" dir="ltr">{formatUsd(Number(p.price_usd), locale)}</td></tr></tfoot>
        </table>
        <dl className="mt-6 space-y-2 text-sm">
          {coin && (
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("paidWith")}</dt>
              <dd dir="ltr">{p.actually_paid !== null ? `${Number(p.actually_paid)} ` : ""}{coin.symbol} ({coin.network})</dd></div>
          )}
          {p.period_end && (
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("validUntil")}</dt><dd>{formatDate(p.period_end, locale)}</dd></div>
          )}
          {tx && (
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("txHash")}</dt>
              <dd className="truncate" dir="ltr"><a href={tx} className="text-primary hover:underline" target="_blank" rel="noreferrer">{p.payin_hash}</a></dd></div>
          )}
        </dl>
      </article>
    </div>
  );
}

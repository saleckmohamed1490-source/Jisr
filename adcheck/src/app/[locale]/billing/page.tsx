import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyProfile, getMySubscription } from "@/lib/credits";
import { listMyPayments } from "@/lib/data/payments";
import { explorerUrl, findCoin } from "@/lib/payments/currencies";
import { FINAL_STATUSES } from "@/lib/payments/types";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { CreditsCard } from "@/components/CreditsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusVariant = (s: string) =>
  s === "finished" ? "success" : s === "partially_paid" ? "warning" : ["failed", "expired", "refunded"].includes(s) ? "destructive" : "secondary";

export default async function BillingPage({ params }: PageProps<"/[locale]/billing">) {
  const locale = await pageLocale(params);
  if (!(await getUser())) return redirect({ href: "/login?next=/billing", locale });
  const [t, ts, tp, profile, sub, payments] = await Promise.all([
    getTranslations("billing"),
    getTranslations("paymentStatus"),
    getTranslations("plans"),
    getMyProfile(),
    getMySubscription(),
    listMyPayments(),
  ]);
  const active = sub?.status === "active" && new Date(sub.current_period_end) > new Date() ? sub : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("currentPlan")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold">{tp(`${profile?.plan ?? "free"}.name`)}</p>
            <p className="text-sm text-muted-foreground">
              {active ? t("activeUntil", { date: formatDate(active.current_period_end, locale) }) : t("noSubscription")}
            </p>
            {active && <p className="text-xs text-muted-foreground">{t("extendNote")}</p>}
            <div className="flex flex-wrap gap-2">
              {active && <Button asChild><Link href={`/billing/checkout?plan=${active.plan}&months=1`}>{t("renew")}</Link></Button>}
              <Button asChild variant={active ? "outline" : "default"}><Link href="/pricing">{t("seePlans")}</Link></Button>
            </div>
          </CardContent>
        </Card>
        {profile && <CreditsCard profile={profile} subscription={sub} />}
      </div>

      <Card>
        <CardHeader><CardTitle>{t("invoices")}</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noInvoices")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.date")}</TableHead>
                  <TableHead>{t("col.number")}</TableHead>
                  <TableHead>{t("col.plan")}</TableHead>
                  <TableHead>{t("col.amount")}</TableHead>
                  <TableHead>{t("col.paid")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                  <TableHead>{t("col.tx")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const coin = findCoin(p.pay_currency);
                  const tx = explorerUrl(p.pay_currency, p.payin_hash);
                  const open = !FINAL_STATUSES.includes(p.status);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(p.created_at, locale)}</TableCell>
                      <TableCell dir="ltr">#{p.invoice_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{tp(`${p.plan}.name`)} · {t("months", { months: p.months })}</TableCell>
                      <TableCell dir="ltr">{formatUsd(Number(p.price_usd), locale)}</TableCell>
                      <TableCell dir="ltr" className="whitespace-nowrap">
                        {p.actually_paid !== null && coin ? `${Number(p.actually_paid)} ${coin.symbol}` : coin ? `— ${coin.symbol}` : "—"}
                        {coin && <span className="block text-xs text-muted-foreground">{coin.network}</span>}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant(p.status)}>{ts(p.status)}</Badge></TableCell>
                      <TableCell>{tx ? <a className="text-primary hover:underline" href={tx} target="_blank" rel="noreferrer">{t("viewTx")}</a> : "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.status === "finished" ? (
                          <Link className="text-primary hover:underline" href={`/billing/invoices/${p.id}`}>{t("viewInvoice")}</Link>
                        ) : open ? (
                          <Link className="text-primary hover:underline" href={`/billing/status?order=${p.order_id}`}>{t("continuePayment")}</Link>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

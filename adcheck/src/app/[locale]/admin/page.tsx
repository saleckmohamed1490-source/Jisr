import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { getUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-data/is-admin";
import { getAdminStats } from "@/lib/admin-data/stats";
import { findCoin } from "@/lib/payments/currencies";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { ManualActivateForm } from "@/components/ManualActivateForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { robots: { index: false } };

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold" dir="ltr">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  const locale = await pageLocale(params);
  const user = await getUser();
  // Not an admin: behave as if the page did not exist.
  if (!isAdminEmail(user?.email)) notFound();

  const [t, ts, tp, s] = await Promise.all([
    getTranslations("admin"),
    getTranslations("paymentStatus"),
    getTranslations("plans"),
    getAdminStats(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("users")} value={s.users} />
        <Stat label={t("activeSubscribers")} value={s.activeTotal}
          sub={(["starter", "pro", "agency"] as const).map((p) => `${tp(`${p}.name`)}: ${s.activeByPlan[p] ?? 0}`).join(" · ")} />
        <Stat label={t("revenueMonth")} value={formatUsd(s.revenueThisMonth, locale)} sub={t("revenue30d", { amount: formatUsd(s.revenue30d, locale) })} />
        <Stat label={t("pendingPayments")} value={s.pendingPayments} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          <CardHeader><CardTitle>{t("latestPayments")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.date")}</TableHead>
                  <TableHead>{t("col.user")}</TableHead>
                  <TableHead>{t("col.plan")}</TableHead>
                  <TableHead>{t("col.amount")}</TableHead>
                  <TableHead>{t("col.status")}</TableHead>
                  <TableHead>{t("col.order")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.latestPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDate(p.created_at, locale, true)}</TableCell>
                    <TableCell className="max-w-40 truncate text-xs" dir="ltr">{p.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{tp(`${p.plan}.name`)} · {p.months}m</TableCell>
                    <TableCell className="whitespace-nowrap text-xs" dir="ltr">
                      {formatUsd(Number(p.price_usd), locale)}
                      {p.actually_paid !== null && <span className="block text-muted-foreground">{Number(p.actually_paid)} {findCoin(p.pay_currency)?.symbol ?? p.pay_currency}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "finished" ? "success" : p.status === "partially_paid" ? "warning" : "secondary"}>{ts(p.status)}</Badge>
                      {p.provider === "manual" && <Badge variant="outline" className="ms-1">{t("manual")}</Badge>}
                      {p.note && <span className="mt-1 block max-w-48 truncate text-[11px] text-muted-foreground" title={p.note}>{p.note}</span>}
                    </TableCell>
                    <TableCell className="text-[11px]" dir="ltr"><code>{p.order_id}</code></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <ManualActivateForm />
      </div>
    </div>
  );
}

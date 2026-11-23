"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Clock, Loader2, XCircle, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { FINAL_STATUSES, type PaymentStatus } from "@/lib/payments/types";
import { explorerUrl, findCoin } from "@/lib/payments/currencies";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Payment = {
  order_id: string;
  status: PaymentStatus;
  plan: "starter" | "pro" | "agency";
  months: number;
  price_usd: number;
  pay_currency: string | null;
  pay_amount: number | null;
  actually_paid: number | null;
  payin_hash: string | null;
  invoice_url: string | null;
  period_end: string | null;
};

const fmtCrypto = (n: number) => Number(n.toFixed(8)).toString();

/** Polls our own API (updated by the IPN webhook) and shows the status live. */
export function PaymentStatusLive({ orderId }: { orderId: string }) {
  const t = useTranslations("status");
  const ts = useTranslations("paymentStatus");
  const tp = useTranslations("plans");
  const locale = useLocale();
  const [p, setP] = useState<Payment | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const res = await fetch(`/api/payments/${encodeURIComponent(orderId)}`, { cache: "no-store" });
        if (res.status === 404) return setMissing(true);
        const data = (await res.json()) as Payment;
        if (stop) return;
        setP(data);
        if (FINAL_STATUSES.includes(data.status) && !(data.status === "finished" && !data.period_end)) return;
      } catch {
        /* retry */
      }
      if (!stop) timer = setTimeout(tick, 5000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  if (missing) return <Alert variant="destructive">{t("notFound")}</Alert>;
  if (!p) return <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />;

  const coin = findCoin(p.pay_currency);
  const tx = explorerUrl(p.pay_currency, p.payin_hash);
  const planName = tp(`${p.plan}.name`);
  const waiting = !FINAL_STATUSES.includes(p.status) && p.status !== "partially_paid";

  return (
    <Card>
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{t("order")}: <code dir="ltr">{p.order_id}</code></span>
          <Badge variant={p.status === "finished" ? "success" : p.status === "partially_paid" ? "warning" : ["failed", "expired", "refunded"].includes(p.status) ? "destructive" : "secondary"}>
            {ts(p.status)}
          </Badge>
        </div>
        <p className="text-lg font-semibold">
          {planName} · <span dir="ltr">{formatUsd(Number(p.price_usd), locale)}</span>
          {coin && p.pay_amount !== null && (
            <span className="text-sm font-normal text-muted-foreground" dir="ltr"> ≈ {fmtCrypto(Number(p.pay_amount))} {coin.symbol} ({coin.network})</span>
          )}
        </p>

        {p.status === "finished" && (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertTitle>{t("finishedTitle")}</AlertTitle>
            <AlertDescription>{p.period_end ? t("finishedBody", { plan: planName, date: formatDate(p.period_end, locale) }) : <Loader2 className="size-4 animate-spin" />}</AlertDescription>
          </Alert>
        )}
        {waiting && (
          <Alert>
            <Clock className="size-4" />
            <AlertTitle>{ts(p.status)}</AlertTitle>
            <AlertDescription>{t("waitingBody")}</AlertDescription>
          </Alert>
        )}
        {p.status === "partially_paid" && coin && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertTitle>{t("partialTitle")}</AlertTitle>
            <AlertDescription>
              {t("partialBody", {
                paid: fmtCrypto(Number(p.actually_paid ?? 0)),
                expected: fmtCrypto(Number(p.pay_amount ?? 0)),
                remaining: fmtCrypto(Math.max(0, Number(p.pay_amount ?? 0) - Number(p.actually_paid ?? 0))),
                coin: coin.symbol,
              })}
            </AlertDescription>
          </Alert>
        )}
        {["failed", "expired"].includes(p.status) && (
          <Alert variant="destructive"><XCircle className="size-4" /><AlertDescription>{t("failedBody")}</AlertDescription></Alert>
        )}
        {p.status === "refunded" && <Alert>{t("refundedBody")}</Alert>}

        <div className="flex flex-wrap gap-2">
          {p.status === "finished" && <Button asChild><Link href="/dashboard">{t("goDashboard")}</Link></Button>}
          {(waiting || p.status === "partially_paid") && p.invoice_url && (
            <Button asChild><a href={p.invoice_url} target="_blank" rel="noreferrer">{t("openInvoice")}</a></Button>
          )}
          {p.status === "partially_paid" && (
            <Button asChild variant="outline"><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Order ${p.order_id}`)}`}>{t("contactSupport")}</a></Button>
          )}
          {["failed", "expired"].includes(p.status) && (
            <Button asChild variant="outline"><Link href={`/billing/checkout?plan=${p.plan}&months=${p.months}`}>{t("tryAgain")}</Link></Button>
          )}
          {tx && <Button asChild variant="ghost"><a href={tx} target="_blank" rel="noreferrer">↗ Tx</a></Button>}
        </div>
        {waiting && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />{t("autoRefresh")}</p>}
      </CardContent>
    </Card>
  );
}

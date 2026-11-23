import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMySubscription } from "@/lib/credits";
import { isDuration, isPaidPlan, priceFor } from "@/lib/plans";
import { COINS, DEFAULT_COIN } from "@/lib/payments/currencies";
import { startCryptoCheckout } from "@/lib/payments/actions";
import { formatDate, formatUsd } from "@/lib/i18n/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanFeatures } from "@/components/PlanFeatures";

export default async function CheckoutPage({ params, searchParams }: PageProps<"/[locale]/billing/checkout">) {
  const locale = await pageLocale(params);
  const sp = await searchParams;
  const plan = sp.plan;
  const months = Number(sp.months ?? 1);
  if (!isPaidPlan(plan) || !isDuration(months)) return redirect({ href: "/pricing", locale });
  if (!(await getUser())) return redirect({ href: `/login?next=${encodeURIComponent(`/billing/checkout?plan=${plan}&months=${months}`)}`, locale });

  const [t, tp, tpr, sub] = await Promise.all([
    getTranslations("checkout"),
    getTranslations("plans"),
    getTranslations("pricing"),
    getMySubscription(),
  ]);
  const total = priceFor(plan, months);
  const active = sub?.status === "active" && new Date(sub.current_period_end) > new Date() ? sub : null;
  const error = typeof sp.error === "string" && ["not_configured", "provider", "invalid", "rate"].includes(sp.error) ? sp.error : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>
      {sp.cancelled && <Alert variant="warning" className="mb-4">{t("cancelled")}</Alert>}
      {error && <Alert variant="destructive" className="mb-4">{t(`errors.${error as "provider"}`)}</Alert>}
      {active && (
        <Alert className="mb-4">
          {active.plan === plan
            ? t("extendNote", { plan: tp(`${plan}.name`), date: formatDate(active.current_period_end, locale) })
            : t("switchNote", { current: tp(`${active.plan}.name`), plan: tp(`${plan}.name`), date: formatDate(active.current_period_end, locale) })}
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <form action={startCryptoCheckout}>
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="months" value={months} />
          <Card>
            <CardHeader><CardTitle>{t("chooseCoin")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">{t("chooseCoin")}</legend>
                {COINS.map((c) => (
                  <label key={c.code}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-accent">
                    <input type="radio" name="coin" value={c.code} defaultChecked={c.code === DEFAULT_COIN} className="accent-[var(--primary)]" />
                    <span>
                      <span className="block font-semibold">{c.symbol}</span>
                      <span className="block text-xs text-muted-foreground">{t("network")}: {c.network}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Alert variant="warning">{t("networkWarning")}</Alert>
              <Button type="submit" size="lg" className="w-full">{t("pay", { amount: formatUsd(total, locale) })}</Button>
              <p className="text-center text-xs text-muted-foreground">{t("redirectNote")}</p>
              <p className="text-center text-sm">
                <Link href="/how-to-pay-crypto" className="text-primary hover:underline">{t("howTo")}</Link>
              </p>
            </CardContent>
          </Card>
        </form>

        <Card className="h-fit">
          <CardHeader><CardTitle>{t("summary")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("plan")}</dt><dd className="font-semibold">{tp(`${plan}.name`)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t("duration")}</dt><dd>{tpr(`durations.${months as 1}`)}</dd></div>
              <div className="flex justify-between border-t pt-2 text-base"><dt>{t("total")}</dt><dd className="font-bold" dir="ltr">{formatUsd(total, locale)}</dd></div>
            </dl>
            <PlanFeatures plan={plan} />
            <Link href="/pricing" className="block text-sm text-primary hover:underline">{t("changePlan")}</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

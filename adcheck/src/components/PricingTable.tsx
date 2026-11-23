"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DURATIONS, PAID_PLANS, PLANS, priceFor, type Duration, type PlanId } from "@/lib/plans";
import { formatUsd } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanFeatures } from "./PlanFeatures";

/**
 * `signedIn` decides where the buttons go: checkout for members, sign-up otherwise.
 * `currentPlan` highlights the user's plan.
 */
export function PricingTable({ signedIn, currentPlan }: { signedIn: boolean; currentPlan?: PlanId }) {
  const t = useTranslations("pricing");
  const tp = useTranslations("plans");
  const locale = useLocale();
  const [months, setMonths] = useState<Duration>(1);

  return (
    <div className="space-y-8">
      <div role="radiogroup" className="mx-auto flex w-fit gap-1 rounded-lg border bg-white p-1">
        {DURATIONS.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={months === m}
            onClick={() => setMonths(m)}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
              months === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`durations.${m}`)}
            {m === 12 && <Badge variant="success">{t("save")}</Badge>}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-xl">{tp("free.name")}</CardTitle>
            <p className="text-sm text-muted-foreground">{tp("free.tagline")}</p>
            <p className="pt-2"><span className="text-4xl font-bold" dir="ltr">$0</span></p>
          </CardHeader>
          <CardContent className="flex-1"><PlanFeatures plan="free" /></CardContent>
          <CardFooter>
            {currentPlan === "free" ? (
              <Button variant="outline" className="w-full" disabled>{t("current")}</Button>
            ) : (
              <Button asChild variant="outline" className="w-full"><Link href={signedIn ? "/dashboard" : "/signup"}>{t("startFree")}</Link></Button>
            )}
          </CardFooter>
        </Card>

        {PAID_PLANS.map((plan) => {
          const total = priceFor(plan, months);
          const perMonth = total / months;
          const popular = plan === "pro";
          return (
            <Card key={plan} className={cn("relative flex flex-col", popular && "border-primary shadow-lg")}>
              {popular && <Badge className="absolute -top-2.5 start-4">{t("popular")}</Badge>}
              <CardHeader>
                <CardTitle className="text-xl">{tp(`${plan}.name`)}</CardTitle>
                <p className="text-sm text-muted-foreground">{tp(`${plan}.tagline`)}</p>
                <p className="pt-2">
                  <span className="text-4xl font-bold" dir="ltr">{formatUsd(Math.round(perMonth * 100) / 100, locale, { compact: true })}</span>{" "}
                  <span className="text-muted-foreground">{t("perMonth")}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {months === 1
                    ? t("billedOnce", { total: formatUsd(total, locale) })
                    : t("billed", { total: formatUsd(total, locale), months })}
                  {months === 12 && PLANS[plan].priceUsd > 0 && (
                    <span className="ms-1 text-muted-foreground line-through" dir="ltr">{formatUsd(PLANS[plan].priceUsd * 12, locale)}</span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="flex-1"><PlanFeatures plan={plan} /></CardContent>
              <CardFooter>
                <Button asChild className="w-full" variant={popular ? "default" : "outline"}>
                  <Link href={signedIn ? `/billing/checkout?plan=${plan}&months=${months}` : `/signup`}>
                    {currentPlan === plan ? t("current") : t("choose", { plan: tp(`${plan}.name`) })}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("cryptoNote")}{" "}
        <Link href="/how-to-pay-crypto" className="font-medium text-primary hover:underline">{t("howTo")}</Link>
      </p>
    </div>
  );
}

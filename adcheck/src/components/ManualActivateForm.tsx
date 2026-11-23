"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { manualActivate, type ActivateState } from "@/lib/admin-data/actions";
import { DURATIONS, PAID_PLANS } from "@/lib/plans";
import { formatDate } from "@/lib/i18n/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export function ManualActivateForm() {
  const t = useTranslations("admin");
  const tp = useTranslations("plans");
  const locale = useLocale();
  const [state, action, pending] = useActionState<ActivateState, FormData>(manualActivate, null);
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>{t("manualTitle")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("manualHint")}</p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="m-email">{t("email")}</Label><Input id="m-email" name="email" type="email" required dir="ltr" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="m-plan">{t("plan")}</Label>
              <NativeSelect id="m-plan" name="plan" defaultValue="starter">{PAID_PLANS.map((p) => <option key={p} value={p}>{tp(`${p}.name`)}</option>)}</NativeSelect></div>
            <div className="space-y-1.5"><Label htmlFor="m-months">{t("months")}</Label>
              <NativeSelect id="m-months" name="months" defaultValue="1">{DURATIONS.map((m) => <option key={m} value={m}>{m}</option>)}</NativeSelect></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="m-order">{t("orderId")}</Label><Input id="m-order" name="orderId" dir="ltr" placeholder="ac_…" /></div>
          <div className="space-y-1.5"><Label htmlFor="m-note">{t("note")}</Label><Input id="m-note" name="note" maxLength={300} /></div>
          {state?.ok === true && <Alert variant="success">{t("activated", { email: state.email, date: formatDate(state.until, locale) })}</Alert>}
          {state?.ok === false && <Alert variant="destructive">{t(`errors.${state.error}`)}</Alert>}
          <Button type="submit" className="w-full" disabled={pending}>{t("activate")}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

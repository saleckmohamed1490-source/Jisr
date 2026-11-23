"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { localeNames, routing } from "@/i18n/routing";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const ERRORS = ["reasonRequired", "tooLong", "rateLimited", "noAppealCredits", "aiFailed", "unauthorized"] as const;
type Err = (typeof ERRORS)[number];

export function AppealForm({
  checkId,
  defaults,
  disabled,
}: {
  checkId?: string;
  defaults?: { adText?: string; product?: string };
  disabled?: boolean;
}) {
  const t = useTranslations("appeals");
  const locale = useLocale();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [adText, setAdText] = useState(defaults?.adText ?? "");
  const [product, setProduct] = useState(defaults?.product ?? "");
  const [changes, setChanges] = useState("");
  const [language, setLanguage] = useState<string>(locale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Err | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) return setError("reasonRequired");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason, adText, product, changesMade: changes, letterLanguage: language, checkId, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError((ERRORS as readonly string[]).includes(data.error) ? data.error : "aiFailed");
      router.push(`/appeals/${data.id}`);
      router.refresh();
    } catch {
      setError("aiFailed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("formTitle")}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="reason">{t("reason")}</Label>
            <Textarea id="reason" dir="auto" rows={5} maxLength={4000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("reasonHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adText">{t("adText")}</Label>
            <Textarea id="adText" dir="auto" rows={3} maxLength={3000} value={adText} onChange={(e) => setAdText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product">{t("product")}</Label>
            <Input id="product" dir="auto" maxLength={1000} value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="changes">{t("changes")}</Label>
            <Textarea id="changes" dir="auto" rows={3} maxLength={2000} value={changes} onChange={(e) => setChanges(e.target.value)} placeholder={t("changesPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="language">{t("letterLanguage")}</Label>
            <NativeSelect id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="sm:w-60">
              {routing.locales.map((l) => <option key={l} value={l}>{localeNames[l]}</option>)}
            </NativeSelect>
          </div>
          {error && <Alert variant="destructive">{t(`errors.${error}`)}</Alert>}
          <Button type="submit" size="lg" className="w-full" disabled={loading || disabled}>
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            {loading ? t("generating") : t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

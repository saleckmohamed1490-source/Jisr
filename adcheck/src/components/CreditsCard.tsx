import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Profile } from "@/lib/credits";
import { formatDate } from "@/lib/i18n/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CreditsCard({ profile }: { profile: Profile }) {
  const d = useTranslations("dashboard");
  const locale = useLocale();
  const isPro = profile.plan === "pro";
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{d("credits")}</CardTitle>
        <Badge variant={isPro ? "default" : "secondary"}>{d("plan")}: {isPro ? d("planPro") : d("planFree")}</Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-3 ${profile.check_credits === 0 ? "bg-red-50" : "bg-accent"}`}>
            <dt className="text-xs text-muted-foreground">{d("checksLeft")}</dt>
            <dd className="text-2xl font-bold" dir="ltr">{profile.check_credits}</dd>
          </div>
          <div className="rounded-lg bg-accent p-3">
            <dt className="text-xs text-muted-foreground">{d("imagesLeft")}</dt>
            <dd className="text-2xl font-bold" dir="ltr">{profile.image_credits}</dd>
          </div>
        </dl>
        {isPro && profile.credits_renew_at && (
          <p className="mt-3 text-xs text-muted-foreground">{d("renewsOn", { date: formatDate(profile.credits_renew_at, locale) })}</p>
        )}
        {!isPro && <Button asChild className="mt-4 w-full"><Link href="/pricing">{d("upgrade")}</Link></Button>}
      </CardContent>
    </Card>
  );
}

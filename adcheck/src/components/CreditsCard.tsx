import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Profile, Subscription } from "@/lib/credits";
import { PLANS } from "@/lib/plans";
import { formatDate } from "@/lib/i18n/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Counter({ label, value, sub, empty }: { label: string; value: string | number; sub?: string; empty?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${empty ? "bg-red-50" : "bg-accent"}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold" dir="ltr">{value}</dd>
      {sub && <dd className="text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/** The visible credit counter (balances are always read from the database). */
export function CreditsCard({ profile, subscription }: { profile: Profile; subscription?: Subscription | null }) {
  const d = useTranslations("dashboard");
  const tp = useTranslations("plans");
  const locale = useLocale();
  const isPaid = profile.plan !== "free";
  const q = PLANS[profile.plan];
  const active = subscription?.status === "active" ? subscription : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{d("credits")}</CardTitle>
        <Badge variant={isPaid ? "default" : "secondary"}>{tp(`${profile.plan}.name`)}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-3 gap-2">
          <Counter label={d("checksLeft")} value={profile.check_credits} empty={profile.check_credits === 0}
            sub={q.fairUseChecks ? d("fairUse") : undefined} />
          <Counter label={d("imagesLeft")} value={profile.image_credits} empty={isPaid && profile.image_credits === 0} />
          <Counter label={d("appealsLeft")} value={profile.appeal_credits === null ? "∞" : profile.appeal_credits}
            sub={profile.appeal_credits === null ? d("unlimited") : undefined} />
        </dl>
        {active && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>{d("subscriptionEnds", { date: formatDate(active.current_period_end, locale) })}</p>
            {profile.credits_renew_at && new Date(profile.credits_renew_at) < new Date(active.current_period_end) && (
              <p>{d("creditsRenew", { date: formatDate(profile.credits_renew_at, locale) })}</p>
            )}
          </div>
        )}
        {active ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/billing/checkout?plan=${active.plan}&months=1`}>{d("renew")}</Link>
          </Button>
        ) : (
          <Button asChild className="w-full"><Link href="/pricing">{d("upgrade")}</Link></Button>
        )}
      </CardContent>
    </Card>
  );
}

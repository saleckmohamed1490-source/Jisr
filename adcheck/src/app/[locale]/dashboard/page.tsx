import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { listChecks } from "@/lib/data/checks";
import { getMyProfile } from "@/lib/credits";
import { CheckForm } from "@/components/CheckForm";
import { CreditsCard } from "@/components/CreditsCard";
import { HistoryList } from "@/components/HistoryList";
import { Alert } from "@/components/ui/alert";

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const locale = await pageLocale(params);
  const user = await getUser();
  if (!user) return redirect({ href: "/login?next=/dashboard", locale });

  const [t, profile, history] = await Promise.all([getTranslations("dashboard"), getMyProfile(), listChecks()]);
  const outOfChecks = !profile || profile.check_credits <= 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {outOfChecks && <Alert variant="destructive">{t("noCredits")}</Alert>}
          <CheckForm userId={user.id} disabled={outOfChecks} />
        </div>
        <aside className="space-y-6">
          {profile && <CreditsCard profile={profile} />}
          <div>
            <h2 className="mb-3 text-lg font-semibold">{t("historyTitle")}</h2>
            <HistoryList items={history} />
          </div>
        </aside>
      </div>
    </div>
  );
}

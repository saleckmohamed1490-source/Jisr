import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { listChecks } from "@/lib/data/checks";
import { getMyProfile } from "@/lib/credits";
import { CheckForm } from "@/components/CheckForm";
import { CreditsCard } from "@/components/CreditsCard";
import { HistoryList } from "@/components/HistoryList";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard");
  const [{ locale, t }, profile, history] = await Promise.all([getI18n(), getMyProfile(), listChecks()]);
  const outOfChecks = !profile || profile.check_credits <= 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t.dashboard.title}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {outOfChecks && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {t.dashboard.noCredits}
            </p>
          )}
          <CheckForm t={t} locale={locale} userId={user.id} disabled={outOfChecks} />
        </div>
        <aside className="space-y-6">
          {profile && <CreditsCard profile={profile} t={t} locale={locale} />}
          <div>
            <h2 className="mb-3 text-lg font-semibold">{t.dashboard.historyTitle}</h2>
            <HistoryList items={history} t={t} locale={locale} />
          </div>
        </aside>
      </div>
    </div>
  );
}

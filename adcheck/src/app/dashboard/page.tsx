import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { listChecks } from "@/lib/data/checks";
import { CheckForm } from "@/components/CheckForm";
import { HistoryList } from "@/components/HistoryList";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard");
  const { locale, t } = await getI18n();
  const history = await listChecks();

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1fr]">
      <div>
        <h1 className="mb-6 text-2xl font-bold">{t.dashboard.title}</h1>
        <CheckForm t={t} locale={locale} userId={user.id} />
      </div>
      <div>
        <h2 className="mb-4 mt-1 text-xl font-semibold lg:mt-14">{t.dashboard.historyTitle}</h2>
        <HistoryList items={history} t={t} locale={locale} />
      </div>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { listChecks } from "@/lib/data/checks";
import { getMyProfile, getMySubscription } from "@/lib/credits";
import { listMyWorkspaces } from "@/lib/workspaces";
import { PLANS } from "@/lib/plans";
import { CheckForm } from "@/components/CheckForm";
import { CreditsCard } from "@/components/CreditsCard";
import { HistoryList } from "@/components/HistoryList";
import { WorkspaceBar } from "@/components/WorkspaceBar";
import { Alert } from "@/components/ui/alert";

export default async function DashboardPage({ params, searchParams }: PageProps<"/[locale]/dashboard">) {
  const locale = await pageLocale(params);
  const user = await getUser();
  if (!user) return redirect({ href: "/login?next=/dashboard", locale });

  const [t, profile, subscription, workspaces] = await Promise.all([
    getTranslations("dashboard"),
    getMyProfile(),
    getMySubscription(),
    listMyWorkspaces(),
  ]);
  const { ws } = await searchParams;
  const current = typeof ws === "string" && workspaces.some((w) => w.id === ws) ? ws : null;
  const history = await listChecks(30, current);
  const outOfChecks = !profile || profile.check_credits <= 0;
  const maxWorkspaces = PLANS[profile?.plan ?? "free"].workspaces;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>
      {maxWorkspaces > 1 && (
        <div className="mb-6"><WorkspaceBar workspaces={workspaces} current={current} max={maxWorkspaces} /></div>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {outOfChecks && <Alert variant="destructive">{t("noCredits")}</Alert>}
          <CheckForm userId={user.id} disabled={outOfChecks} workspaceId={current}
            workspaceName={workspaces.find((w) => w.id === current)?.name} />
        </div>
        <aside className="space-y-6">
          {profile && <CreditsCard profile={profile} subscription={subscription} />}
          <div>
            <h2 className="mb-3 text-lg font-semibold">{t("historyTitle")}</h2>
            <HistoryList items={history} />
          </div>
        </aside>
      </div>
    </div>
  );
}

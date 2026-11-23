import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/credits";
import { getCheck } from "@/lib/data/checks";
import { AppealForm } from "@/components/AppealForm";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default async function NewAppealPage({ params, searchParams }: PageProps<"/[locale]/appeals/new">) {
  const locale = await pageLocale(params);
  if (!(await getUser())) return redirect({ href: "/login?next=/appeals/new", locale });
  const sp = await searchParams;
  const check = typeof sp.check === "string" ? await getCheck(sp.check) : null;
  const [t, profile] = await Promise.all([getTranslations("appeals"), getMyProfile()]);
  const left = profile?.appeal_credits;
  const outOfCredits = left !== null && left !== undefined && left <= 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      <p className="text-muted-foreground">{t("intro")}</p>
      {check && <Alert>{t("fromCheck")}</Alert>}
      {outOfCredits && (
        <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-3">
          <span>{t("errors.noAppealCredits")}</span>
          <Button asChild size="sm"><Link href="/pricing">{t("upgrade")}</Link></Button>
        </Alert>
      )}
      {!outOfCredits && left !== null && left !== undefined && <p className="text-sm text-muted-foreground">{t("left", { n: left })}</p>}
      <AppealForm checkId={check?.id} defaults={{ adText: check?.ad_text, product: check?.product_description }} disabled={outOfCredits} />
    </div>
  );
}

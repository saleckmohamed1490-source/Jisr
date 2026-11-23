import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyProfile, getMySubscription } from "@/lib/credits";
import { CreditsCard } from "@/components/CreditsCard";

// Replaced by the full subscription & invoices page in the payments stage.
export default async function BillingPage({ params }: PageProps<"/[locale]/billing">) {
  const locale = await pageLocale(params);
  if (!(await getUser())) return redirect({ href: "/login?next=/billing", locale });
  const [t, profile, subscription] = await Promise.all([getTranslations("billing"), getMyProfile(), getMySubscription()]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {profile && <CreditsCard profile={profile} subscription={subscription} />}
    </div>
  );
}

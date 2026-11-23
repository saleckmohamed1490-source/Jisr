import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { getUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/credits";
import { PricingTable } from "@/components/PricingTable";
import { Disclaimer } from "@/components/Disclaimer";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en", namespace: "pricing" });
  return { title: t("title") };
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  await pageLocale(params);
  const t = await getTranslations("pricing");
  const tc = await getTranslations("common");
  const user = await getUser();
  const profile = user ? await getMyProfile() : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PricingTable signedIn={!!user} currentPlan={profile?.plan} />
      <Disclaimer text={tc("disclaimer")} className="mx-auto mt-10 max-w-2xl" />
    </div>
  );
}

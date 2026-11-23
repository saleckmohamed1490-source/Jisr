import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { formatDate } from "@/lib/i18n/format";
import { getUser } from "@/lib/supabase/server";
import { getCheck, listGeneratedImages, signedImageUrl } from "@/lib/data/checks";
import { getMyProfile } from "@/lib/credits";
import { ReportView } from "@/components/ReportView";
import { GenerateImage } from "@/components/GenerateImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function ReportPage({ params }: PageProps<"/[locale]/reports/[id]">) {
  const locale = await pageLocale(params);
  const { id } = await params;
  const user = await getUser();
  if (!user) return redirect({ href: `/login?next=/reports/${id}`, locale });

  const check = await getCheck(id);
  if (!check) notFound();

  const [t, imageUrl, generated, profile] = await Promise.all([
    getTranslations("report"),
    signedImageUrl(check.image_path),
    listGeneratedImages(check.id),
    getMyProfile(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("createdAt", { date: formatDate(check.created_at, locale, true) })}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href={`/appeals/new?check=${check.id}`}>{t("writeAppeal")}</Link></Button>
          <Button asChild><Link href="/dashboard">{t("newCheck")}</Link></Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-[200px_1fr]">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="max-h-64 w-full rounded-lg object-contain" />
          )}
          <div className="min-w-0">
            <h2 className="font-semibold">{t("originalAd")}</h2>
            <p dir="auto" className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{check.ad_text}</p>
            <p dir="auto" className="mt-3 text-sm text-muted-foreground">{check.product_description}</p>
            {check.landing_url && (
              <a href={check.landing_url} target="_blank" rel="noreferrer nofollow" dir="ltr"
                className="mt-2 block truncate text-sm text-primary hover:underline">{check.landing_url}</a>
            )}
          </div>
        </CardContent>
      </Card>

      <ReportView analysis={check.report} />

      <div className="mt-6">
        <GenerateImage
          checkId={check.id}
          initial={generated}
          canGenerate={profile?.plan === "pro"}
          imageCredits={profile?.image_credits ?? 0}
        />
      </div>
    </div>
  );
}

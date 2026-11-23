import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyAppeal } from "@/lib/data/appeals";
import { formatDate } from "@/lib/i18n/format";
import { CopyButton } from "@/components/CopyButton";
import { Disclaimer } from "@/components/Disclaimer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const variant = { likely_mistaken: "success", unclear: "default", likely_justified: "warning" } as const;

export default async function AppealPage({ params }: PageProps<"/[locale]/appeals/[id]">) {
  const locale = await pageLocale(params);
  const { id } = await params;
  if (!(await getUser())) return redirect({ href: `/login?next=/appeals/${id}`, locale });
  const appeal = await getMyAppeal(id);
  if (!appeal) notFound();
  const [t, tc] = await Promise.all([getTranslations("appeals"), getTranslations("common")]);
  const a = appeal.result;
  const dir = appeal.letter_language === "ar" ? "rtl" : "ltr";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("resultTitle")}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(appeal.created_at, locale, true)}</p>
        </div>
        <Button asChild variant="outline"><Link href="/appeals/new">{t("new")}</Link></Button>
      </div>

      <Alert variant={variant[a.assessment]}>
        <AlertTitle>{t(`assessment.${a.assessment}`)}</AlertTitle>
        <AlertDescription>{a.assessment_note}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{t("subject")}</CardTitle>
          <CopyButton text={a.subject} label={tc("copy")} copiedLabel={tc("copied")} />
        </CardHeader>
        <CardContent><p dir={dir} className="font-medium">{a.subject}</p></CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{t("letter")}</CardTitle>
          <CopyButton text={a.letter} label={tc("copy")} copiedLabel={tc("copied")} />
        </CardHeader>
        <CardContent><p dir={dir} className="whitespace-pre-wrap leading-7">{a.letter}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("tips")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 ps-5 text-slate-700">{a.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        </CardContent>
      </Card>

      {appeal.check_id && <Link href={`/reports/${appeal.check_id}`} className="text-sm text-primary hover:underline">{t("viewCheck")}</Link>}
      <Disclaimer text={t("disclaimer")} />
    </div>
  );
}

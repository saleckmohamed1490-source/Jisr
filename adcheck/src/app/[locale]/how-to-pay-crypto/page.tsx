import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link } from "@/i18n/navigation";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export async function generateMetadata({ params }: PageProps<"/[locale]/how-to-pay-crypto">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "en", namespace: "howToPay" });
  return { title: t("title") };
}

export default async function HowToPayPage({ params }: PageProps<"/[locale]/how-to-pay-crypto">) {
  await pageLocale(params);
  const t = await getTranslations("howToPay");
  const steps = t.raw("steps") as { title: string; body: string }[];
  const tips = t.raw("tips") as string[];
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 leading-7 text-muted-foreground">{t("intro")}</p>
      <ol className="mt-8 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card>
              <CardContent className="flex gap-4 pt-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
                <div><h2 className="font-semibold">{s.title}</h2><p className="mt-1 leading-7 text-slate-700">{s.body}</p></div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <Alert variant="warning" className="mt-8">
        <AlertTitle>{t("tipsTitle")}</AlertTitle>
        <ul className="mt-2 list-disc space-y-1 ps-5">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </Alert>
      <Button asChild size="lg" className="mt-8"><Link href="/pricing">{t("cta")}</Link></Button>
    </div>
  );
}

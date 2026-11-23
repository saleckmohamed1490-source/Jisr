import { getTranslations } from "next-intl/server";
import {
  AlertTriangle, CheckCircle2, FileText, Globe, ImageIcon, LayoutGrid, ShieldCheck, Sparkles, Wallet, XCircle,
} from "lucide-react";
import { pageLocale } from "@/i18n/params";
import { Link } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Disclaimer } from "@/components/Disclaimer";
import { PricingTable } from "@/components/PricingTable";

const FEATURE_ICONS = [ShieldCheck, Sparkles, Globe, ImageIcon, FileText, LayoutGrid];
const withApp = (s: string) => s.replaceAll("{app}", APP_NAME);

export default async function Home({ params }: PageProps<"/[locale]">) {
  await pageLocale(params);
  const [t, tc, tp, user] = await Promise.all([
    getTranslations("landing"),
    getTranslations("common"),
    getTranslations("pricing"),
    process.env.NEXT_PUBLIC_SUPABASE_URL ? getUser() : Promise.resolve(null),
  ]);
  const steps = t.raw("steps") as { title: string; body: string }[];
  const features = t.raw("features") as { title: string; body: string }[];
  const checks = t.raw("checks") as string[];
  const faq = t.raw("faq") as { q: string; a: string }[];
  const start = user ? "/dashboard" : "/signup";

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 via-white to-transparent">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <Badge variant="secondary" className="mb-4">{t("badge")}</Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{t("heroTitle")}</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">{t("heroSubtitle", { app: APP_NAME })}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link href={start}>{t("ctaPrimary")}</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/pricing">{t("ctaSecondary")}</Link></Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("freeNote")}</p>
          </div>

          {/* Illustrative report preview */}
          <Card aria-hidden className="shadow-xl">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <Badge variant="destructive" className="gap-1 px-2.5 py-1 text-sm"><XCircle className="size-4" />{t("preview.verdict")}</Badge>
                <span className="text-sm font-semibold" dir="ltr">{t("preview.score")}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full w-[78%] bg-red-500" /></div>
              <div className="space-y-2 text-sm">
                <p className="flex gap-2 rounded-lg border p-3"><AlertTriangle className="size-4 shrink-0 text-red-600" />{t("preview.issue1")}</p>
                <p className="flex gap-2 rounded-lg border p-3"><AlertTriangle className="size-4 shrink-0 text-amber-600" />{t("preview.issue2")}</p>
                <p className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><CheckCircle2 className="size-4 shrink-0 text-emerald-600" />{t("preview.rewrite")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">{t("howTitle")}</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full">
                <CardContent className="pt-6">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-7 text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">{t("featuresTitle")}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? ShieldCheck;
              return (
                <div key={f.title} className="rounded-xl border p-6">
                  <Icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* What we check */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">{t("checksTitle")}</h2>
        <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c} className="flex gap-3 rounded-lg border bg-white p-4">
              <ShieldCheck className="size-5 shrink-0 text-primary" />
              {c}
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold">{tp("title")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{tp("subtitle")}</p>
          </div>
          <PricingTable signedIn={!!user} />
        </div>
      </section>

      {/* Crypto */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Card className="bg-accent">
          <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <Wallet className="size-8 shrink-0 text-primary" />
              <div>
                <h2 className="text-xl font-bold">{t("cryptoTitle")}</h2>
                <p className="mt-1 text-muted-foreground">{t("cryptoBody")}</p>
              </div>
            </div>
            <Button asChild variant="outline"><Link href="/how-to-pay-crypto">{t("cryptoCta")}</Link></Button>
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="text-center text-3xl font-bold">{t("faqTitle")}</h2>
        <div className="mt-8 divide-y rounded-xl border bg-white">
          {faq.map((item) => (
            <details key={withApp(item.q)} className="group p-5">
              <summary className="cursor-pointer list-none font-medium marker:hidden">
                <span className="flex items-center justify-between gap-3">{withApp(item.q)}<span className="text-muted-foreground transition group-open:rotate-45">+</span></span>
              </summary>
              <p className="mt-3 leading-7 text-muted-foreground">{withApp(item.a)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-4 pb-8 text-center">
        <h2 className="text-3xl font-bold">{t("finalTitle")}</h2>
        <Button asChild size="lg" className="mt-6"><Link href={start}>{t("finalCta")}</Link></Button>
        <Disclaimer text={tc("disclaimer")} className="mx-auto mt-10 max-w-xl text-start" />
      </section>
    </>
  );
}

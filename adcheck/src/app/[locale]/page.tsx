import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Disclaimer } from "@/components/Disclaimer";

export default async function Home({ params }: PageProps<"/[locale]">) {
  await pageLocale(params);
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  const steps = t.raw("steps") as { title: string; body: string }[];
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 text-center">
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{t("heroTitle")}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{t("heroSubtitle")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg"><Link href="/signup">{t("ctaPrimary")}</Link></Button>
      </div>
      <ol className="mt-12 grid gap-4 text-start sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl border bg-card p-5">
            <span className="font-bold text-primary">{i + 1}.</span> <strong>{s.title}</strong>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <Disclaimer text={tc("disclaimer")} className="mx-auto mt-10 max-w-xl text-start" />
    </section>
  );
}

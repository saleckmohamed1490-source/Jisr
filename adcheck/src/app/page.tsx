import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Disclaimer } from "@/components/Disclaimer";
import { Pricing } from "@/components/Pricing";

export default async function Home() {
  const { t } = await getI18n();
  const l = t.landing;
  return (
    <>
      <section className="bg-gradient-to-b from-brand-50 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{l.heroTitle}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">{l.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/check" className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">
              {l.ctaPrimary}
            </Link>
            <Link href="#pricing" className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold hover:bg-slate-50">
              {l.ctaSecondary}
            </Link>
          </div>
          <Disclaimer text={t.common.disclaimer} className="mx-auto mt-8 max-w-xl" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-3xl font-bold">{l.howTitle}</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {l.steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 leading-7 text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-center text-3xl font-bold">{l.featuresTitle}</h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {l.features.map((feat) => (
            <li key={feat} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <span className="text-brand-600">●</span>
              {feat}
            </li>
          ))}
        </ul>
      </section>

      <Pricing t={t} freeHref="/check" proHref="/check" />
    </>
  );
}

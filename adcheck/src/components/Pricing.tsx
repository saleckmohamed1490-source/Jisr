import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export function Pricing({ t, freeHref, proHref }: { t: Dictionary; freeHref: string; proHref: string }) {
  const p = t.pricing;
  const plans = [
    { ...p.free, href: freeHref, highlight: false },
    { ...p.pro, href: proHref, highlight: true },
  ];
  return (
    <section id="pricing" className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="text-center text-3xl font-bold">{p.title}</h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-2xl border bg-white p-6 ${plan.highlight ? "border-brand-500 shadow-lg" : "border-slate-200"}`}
          >
            <h3 className="text-xl font-semibold">{plan.name}</h3>
            <p className="mt-2">
              <span className="text-4xl font-bold">{plan.price}</span>{" "}
              <span className="text-slate-500">{p.perMonth}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2">
              {plan.features.map((feat) => (
                <li key={feat} className="flex gap-2 text-slate-700">
                  <span className="text-emerald-600">✓</span>
                  {feat}
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className={`mt-6 rounded-lg px-4 py-2.5 text-center font-semibold ${plan.highlight ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-slate-300 hover:bg-slate-50"}`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

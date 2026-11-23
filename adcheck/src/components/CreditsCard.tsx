import Link from "next/link";
import type { Profile } from "@/lib/credits";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { fmt, type Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";

export function CreditsCard({ profile, t, locale }: { profile: Profile; t: Dictionary; locale: Locale }) {
  const d = t.dashboard;
  const isPro = profile.plan === "pro";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{d.credits}</h2>
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${isPro ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"}`}>
          {d.plan}: {isPro ? d.planPro : d.planFree}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 ${profile.check_credits === 0 ? "bg-red-50" : "bg-brand-50"}`}>
          <dt className="text-xs text-slate-600">{d.checksLeft}</dt>
          <dd className="text-2xl font-bold" dir="ltr">{profile.check_credits}</dd>
        </div>
        <div className="rounded-lg bg-brand-50 p-3">
          <dt className="text-xs text-slate-600">{d.imagesLeft}</dt>
          <dd className="text-2xl font-bold" dir="ltr">{profile.image_credits}</dd>
        </div>
      </dl>
      {isPro && profile.credits_renew_at && (
        <p className="mt-3 text-xs text-slate-500">
          {fmt(d.renewsOn, { date: formatDate(profile.credits_renew_at, locale) })}
        </p>
      )}
      {!isPro && (
        <Link href="/billing" className="mt-4 block rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700">
          {d.upgrade}
        </Link>
      )}
    </section>
  );
}

import { redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/credits";
import { getBillingProvider } from "@/lib/billing";
import { openCustomerPortal, startCheckout } from "@/lib/billing/actions";
import type { MySubscription } from "@/lib/billing/service";
import { CreditsCard } from "@/components/CreditsCard";
import { Disclaimer } from "@/components/Disclaimer";

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const user = await getUser();
  if (!user) redirect("/login?next=/billing");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ locale, t }, profile, { data: sub }] = await Promise.all([
    getI18n(),
    getMyProfile(),
    supabase
      .from("subscriptions")
      .select("provider, provider_subscription_id, status, current_period_end")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<MySubscription>(),
  ]);
  const b = t.billing;
  const configured = getBillingProvider()?.isConfigured() ?? false;
  const isPro = profile?.plan === "pro";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{b.title}</h1>

      {sp.success === "1" && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">{b.success}</p>
      )}
      {(sp.error === "not_configured" || !configured) && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{b.notConfigured}</p>
      )}
      {sp.error === "checkout" && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-700">{t.common.error}</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {profile && <CreditsCard profile={profile} t={t} locale={locale} />}

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">{t.pricing.pro.name} — {t.pricing.pro.price} {t.pricing.perMonth}</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {t.pricing.pro.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          {sub && (
            <p className="mt-4 text-sm text-slate-600">
              {b.status}: <strong>{b.statuses[sub.status] ?? sub.status}</strong>
              {sub.current_period_end && (
                <>
                  <br />
                  {fmt(b.renews, { date: formatDate(sub.current_period_end, locale) })}
                </>
              )}
            </p>
          )}
          <div className="mt-5">
            {isPro && sub ? (
              <form action={openCustomerPortal}>
                <button className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-semibold hover:bg-slate-50">{b.manage}</button>
              </form>
            ) : (
              <form action={startCheckout}>
                <button disabled={!configured} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                  {b.subscribe}
                </button>
              </form>
            )}
          </div>
        </section>
      </div>

      <Disclaimer text={t.common.disclaimer} />
    </div>
  );
}

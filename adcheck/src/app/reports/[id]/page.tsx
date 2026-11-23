import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { getUser } from "@/lib/supabase/server";
import { getCheck, signedImageUrl } from "@/lib/data/checks";
import { ReportView } from "@/components/ReportView";

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/reports/${id}`);

  const check = await getCheck(id);
  if (!check) notFound();

  const { locale, t } = await getI18n();
  const imageUrl = await signedImageUrl(check.image_path);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.report.title}</h1>
          <p className="text-sm text-slate-500">
            {fmt(t.report.createdAt, { date: formatDate(check.created_at, locale, true) })}
          </p>
        </div>
        <Link href="/dashboard" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
          {t.report.newCheck}
        </Link>
      </div>

      <section className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-[200px_1fr]">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="max-h-64 w-full rounded-lg object-contain" />
        )}
        <div>
          <h2 className="font-semibold">{t.report.originalAd}</h2>
          <p dir="auto" className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{check.ad_text}</p>
          <p dir="auto" className="mt-3 text-sm text-slate-500">{check.product_description}</p>
        </div>
      </section>

      <ReportView analysis={check.report} t={t} />
    </div>
  );
}

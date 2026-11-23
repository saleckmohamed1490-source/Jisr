import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { PaymentStatusLive } from "@/components/PaymentStatusLive";

export default async function PaymentStatusPage({ params, searchParams }: PageProps<"/[locale]/billing/status">) {
  const locale = await pageLocale(params);
  const { order } = await searchParams;
  if (typeof order !== "string" || !/^[\w-]{4,64}$/.test(order)) return redirect({ href: "/billing", locale });
  if (!(await getUser())) return redirect({ href: `/login?next=${encodeURIComponent(`/billing/status?order=${order}`)}`, locale });
  const t = await getTranslations("status");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("title")}</h1>
      <PaymentStatusLive orderId={order} />
    </div>
  );
}

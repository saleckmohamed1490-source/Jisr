import { getI18n } from "@/lib/i18n/server";
import { CheckForm } from "@/components/CheckForm";

export default async function CheckPage() {
  const { locale, t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <CheckForm t={t} locale={locale} />
    </div>
  );
}

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CheckSummary } from "@/lib/data/checks";
import { formatDate } from "@/lib/i18n/format";
import { VerdictBadge } from "./ReportView";

export function HistoryList({ items }: { items: CheckSummary[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/reports/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50">
            <VerdictBadge verdict={c.verdict} />
            <span dir="auto" className="flex-1 truncate text-sm text-slate-700">{c.ad_text}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(c.created_at, locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

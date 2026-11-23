import Link from "next/link";
import type { CheckSummary } from "@/lib/data/checks";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { VerdictBadge } from "./ReportView";

export function HistoryList({ items, t, locale }: { items: CheckSummary[]; t: Dictionary; locale: Locale }) {
  if (items.length === 0) return <p className="text-slate-500">{t.dashboard.historyEmpty}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/reports/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
            <VerdictBadge verdict={c.verdict} t={t.report} />
            <span dir="auto" className="flex-1 truncate text-slate-700">{c.ad_text}</span>
            <span className="shrink-0 text-xs text-slate-500">{formatDate(c.created_at, locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

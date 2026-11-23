import type { Analysis } from "@/lib/analysis/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { CopyButton } from "./CopyButton";
import { Disclaimer } from "./Disclaimer";

const verdictStyles: Record<Analysis["verdict"], string> = {
  compliant: "bg-emerald-100 text-emerald-800 border-emerald-300",
  medium_risk: "bg-amber-100 text-amber-800 border-amber-300",
  non_compliant: "bg-red-100 text-red-800 border-red-300",
};

const severityStyles = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
} as const;

export function VerdictBadge({ verdict, t }: { verdict: Analysis["verdict"]; t: Dictionary["report"] }) {
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-sm font-semibold ${verdictStyles[verdict]}`}>
      {t.verdicts[verdict]}
    </span>
  );
}

export function ReportView({ analysis, t }: { analysis: Analysis; t: Dictionary }) {
  const r = t.report;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{r.verdict}</span>
            <VerdictBadge verdict={analysis.verdict} t={r} />
          </div>
          <div className="text-sm text-slate-600">
            {r.riskScore}: <strong dir="ltr">{analysis.risk_score}/100</strong>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${analysis.risk_score >= 60 ? "bg-red-500" : analysis.risk_score >= 30 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${analysis.risk_score}%` }}
          />
        </div>
        <h3 className="mt-4 font-semibold">{r.summary}</h3>
        <p className="mt-1 leading-7 text-slate-700">{analysis.summary}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold">{r.issues}</h3>
        {analysis.issues.length === 0 ? (
          <p className="mt-2 text-slate-600">{r.noIssues}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {analysis.issues.map((issue, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${severityStyles[issue.severity]}`}>
                    {r.severity[issue.severity]}
                  </span>
                  <strong>{issue.title}</strong>
                </div>
                <p className="mt-2 leading-7 text-slate-700">{issue.explanation}</p>
                <p className="mt-2 text-sm text-slate-500">
                  {r.policy}: <span className="font-medium text-slate-700">{issue.policy}</span> · {r.where}:{" "}
                  {r.locations[issue.location]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold">{r.suggestions}</h3>
        <ul className="mt-3 space-y-2">
          {analysis.suggestions.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 shrink-0 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {r.targets[s.target]}
              </span>
              <span className="leading-7 text-slate-700">{s.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{r.rewritten}</h3>
          <CopyButton text={analysis.rewritten_text} label={t.common.copy} copiedLabel={t.common.copied} />
        </div>
        <p dir="auto" className="mt-3 whitespace-pre-wrap leading-7">
          {analysis.rewritten_text}
        </p>
      </section>

      <Disclaimer text={t.common.disclaimer} />
    </div>
  );
}

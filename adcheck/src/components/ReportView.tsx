import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { Analysis } from "@/lib/analysis/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CopyButton } from "./CopyButton";
import { Disclaimer } from "./Disclaimer";

const verdictVariant = { compliant: "success", medium_risk: "warning", non_compliant: "destructive" } as const;
const verdictIcon = { compliant: CheckCircle2, medium_risk: AlertTriangle, non_compliant: XCircle };
const severityVariant = { low: "secondary", medium: "warning", high: "destructive" } as const;

export function VerdictBadge({ verdict, t }: { verdict: Analysis["verdict"]; t: Dictionary["report"] }) {
  const Icon = verdictIcon[verdict];
  return (
    <Badge variant={verdictVariant[verdict]} className="gap-1 px-2.5 py-1 text-sm">
      <Icon className="size-4" />
      {t.verdicts[verdict]}
    </Badge>
  );
}

export function ReportView({ analysis, t }: { analysis: Analysis; t: Dictionary }) {
  const r = t.report;
  const score = analysis.risk_score;
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{r.verdict}</span>
              <VerdictBadge verdict={analysis.verdict} t={r} />
            </div>
            <div className="text-sm text-muted-foreground">
              {r.riskScore}: <strong className="text-foreground" dir="ltr">{score}/100</strong>
            </div>
          </div>
          <Progress
            value={score}
            aria-label={r.riskScore}
            indicatorClassName={score >= 60 ? "bg-red-500" : score >= 30 ? "bg-amber-500" : "bg-emerald-500"}
          />
          <div>
            <h3 className="font-semibold">{r.summary}</h3>
            <p className="mt-1 leading-7 text-slate-700">{analysis.summary}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{r.issues}</CardTitle></CardHeader>
        <CardContent>
          {analysis.issues.length === 0 ? (
            <p className="text-muted-foreground">{r.noIssues}</p>
          ) : (
            <ul className="space-y-3">
              {analysis.issues.map((issue, i) => (
                <li key={i} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityVariant[issue.severity]}>{r.severity[issue.severity]}</Badge>
                    <strong>{issue.title}</strong>
                  </div>
                  <p className="mt-2 leading-7 text-slate-700">{issue.explanation}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {r.policy}: <span className="font-medium text-foreground">{issue.policy}</span> · {r.where}:{" "}
                    {r.locations[issue.location]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">{r.suggestions}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.suggestions.map((s, i) => (
              <li key={i} className="flex gap-3">
                <Badge variant="secondary" className="mt-1 h-fit shrink-0">{r.targets[s.target]}</Badge>
                <span className="leading-7 text-slate-700">{s.action}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">{r.rewritten}</CardTitle>
          <CopyButton text={analysis.rewritten_text} label={t.common.copy} copiedLabel={t.common.copied} />
        </CardHeader>
        <CardContent>
          <p dir="auto" className="whitespace-pre-wrap leading-7">{analysis.rewritten_text}</p>
        </CardContent>
      </Card>

      <Disclaimer text={t.common.disclaimer} />
    </div>
  );
}

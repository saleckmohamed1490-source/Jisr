import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { PLANS, type PlanId } from "@/lib/plans";

type FeatureT = (key: string, values?: Record<string, number>) => string;

export function planFeatureList(plan: PlanId, t: FeatureT) {
  const q = PLANS[plan];
  const items: { text: string; included: boolean }[] = [];
  if (plan === "agency") items.push({ text: t("everythingPro"), included: true });
  items.push({
    text: plan === "free" ? t("checksOnce", { n: q.checks }) : q.fairUseChecks ? t("checksUnlimited", { n: q.checks }) : t("checks", { n: q.checks }),
    included: true,
  });
  items.push(q.images > 0 ? { text: t("images", { n: q.images }), included: true } : { text: t("noImages"), included: false });
  items.push(
    q.appeals === null
      ? { text: t("appealsUnlimited"), included: true }
      : q.appeals > 0
        ? { text: t("appeals", { n: q.appeals }), included: true }
        : { text: t("noAppeals"), included: false },
  );
  if (q.workspaces > 1) items.push({ text: t("workspaces", { n: q.workspaces }), included: true });
  items.push({ text: t("landing"), included: true }, { text: t("history"), included: true });
  return items;
}

export function PlanFeatures({ plan }: { plan: PlanId }) {
  const t = useTranslations("plans.features");
  return (
    <ul className="space-y-2 text-sm">
      {planFeatureList(plan, t as unknown as FeatureT).map((f) => (
        <li key={f.text} className={`flex gap-2 ${f.included ? "text-slate-700" : "text-muted-foreground"}`}>
          {f.included ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Minus className="mt-0.5 size-4 shrink-0" />}
          {f.text}
        </li>
      ))}
    </ul>
  );
}

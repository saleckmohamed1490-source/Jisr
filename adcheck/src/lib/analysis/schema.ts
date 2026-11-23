import { z } from "zod";

export const VERDICTS = ["compliant", "medium_risk", "non_compliant"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const IssueSchema = z.object({
  title: z.string().describe("Short name of the problem, in the report language"),
  severity: z.enum(["low", "medium", "high"]),
  location: z.enum(["image", "text", "both", "product", "landing"]),
  policy: z
    .string()
    .describe("Name of the Meta advertising policy concerned, e.g. 'Personal attributes'"),
  explanation: z
    .string()
    .describe("Why this may be rejected, quoting the problematic element, in the report language"),
});

export const SuggestionSchema = z.object({
  target: z.enum(["image", "text", "targeting", "general"]),
  action: z.string().describe("A concrete, actionable edit, in the report language"),
});

/** The JSON the model must return. Validated by zod on every response. */
export const AnalysisSchema = z.object({
  verdict: z.enum(VERDICTS),
  risk_score: z.number().int().describe("0 = no risk, 100 = certain rejection"),
  summary: z.string().describe("2-3 sentence overview, in the report language"),
  issues: z.array(IssueSchema),
  suggestions: z.array(SuggestionSchema),
  rewritten_text: z
    .string()
    .describe("A compliant rewrite of the ad text, in the same language as the original ad text"),
  image_prompt: z
    .string()
    .describe(
      "English prompt for an image generator describing a new, compliant ad image for this product (no text overlays, no logos of other brands, no before/after, no body-part close-ups)",
    ),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** Post-processing that the JSON schema itself can't express. */
export function normalizeAnalysis(a: Analysis): Analysis {
  return {
    ...a,
    risk_score: Math.max(0, Math.min(100, Math.round(a.risk_score))),
  };
}

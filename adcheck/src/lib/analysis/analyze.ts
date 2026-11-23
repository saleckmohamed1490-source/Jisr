import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Locale } from "@/lib/i18n/config";
import { AnalysisSchema, normalizeAnalysis, type Analysis } from "./schema";
import { buildSystemPrompt, buildUserPrompt, type LandingInfo } from "./prompt";
import { prepareImageForModel } from "./prepare-image";
import { mockAnalysis } from "./mock";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export class AnalysisError extends Error {
  constructor(
    public code: "refused" | "invalid_output" | "api_error" | "not_configured",
    message: string,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AnalysisError("not_configured", "ANTHROPIC_API_KEY is not set");
  }
  client ??= new Anthropic({ timeout: 110_000, maxRetries: 2 });
  return client;
}

export type AnalyzeInput = {
  /** Raw uploaded bytes (already validated: JPG/PNG/WEBP, max 10MB). */
  imageBytes: Uint8Array;
  adText: string;
  product: string;
  locale: Locale;
  landing?: LandingInfo;
};

export async function analyzeAd(input: AnalyzeInput): Promise<{ analysis: Analysis; model: string }> {
  const [system, image] = await Promise.all([buildSystemPrompt(), prepareImageForModel(input.imageBytes)]);
  if (process.env.AI_MOCK === "1") {
    // Demo mode: same pipeline (image is decoded/resized) but no API call.
    return { analysis: mockAnalysis(input.locale), model: "mock" };
  }
  const anthropic = getClient();
  const useFallback = process.env.CLAUDE_FALLBACK !== "off";

  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // A safety-classifier decline on the main model is retried server-side on
      // a fallback model inside the same call. Set CLAUDE_FALLBACK=off to disable.
      ...(useFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(AnalysisSchema),
      },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            },
            { type: "text", text: buildUserPrompt(input) },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[analyze] Claude API error", err.status, err.message);
      throw new AnalysisError("api_error", err.message);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new AnalysisError("refused", "The model declined to review this ad");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnalysisError("invalid_output", "The response was truncated");
  }

  // parse() already validates against the zod schema; re-check defensively.
  const parsed = AnalysisSchema.safeParse(response.parsed_output);
  if (!parsed.success) {
    console.error("[analyze] invalid output", parsed.error.issues);
    throw new AnalysisError("invalid_output", "The model returned an invalid report");
  }
  return { analysis: normalizeAnalysis(parsed.data), model: response.model };
}

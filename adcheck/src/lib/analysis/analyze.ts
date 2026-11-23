import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Locale } from "@/i18n/routing";
import { AnalysisSchema, normalizeAnalysis, type Analysis } from "./schema";
import { buildSystemPrompt, buildUserPrompt, type LandingInfo } from "./prompt";
import { prepareImageForModel } from "./prepare-image";
import { mockAnalysis } from "./mock";

import { AIError, CLAUDE_MODEL, fallbackParams, getAnthropic, isMock } from "@/lib/ai/client";

export { AIError as AnalysisError, CLAUDE_MODEL };

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
  if (isMock()) {
    // Demo mode: same pipeline (image is decoded/resized) but no API call.
    return { analysis: mockAnalysis(input.locale), model: "mock" };
  }
  const anthropic = getAnthropic();

  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // A safety-classifier decline on the main model is retried server-side on
      // a fallback model inside the same call. Set CLAUDE_FALLBACK=off to disable.
      ...fallbackParams(),
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
      throw new AIError("api_error", err.message);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    throw new AIError("refused", "The model declined to review this ad");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AIError("invalid_output", "The response was truncated");
  }

  // parse() already validates against the zod schema; re-check defensively.
  const parsed = AnalysisSchema.safeParse(response.parsed_output);
  if (!parsed.success) {
    console.error("[analyze] invalid output", parsed.error.issues);
    throw new AIError("invalid_output", "The model returned an invalid report");
  }
  return { analysis: normalizeAnalysis(parsed.data), model: response.model };
}

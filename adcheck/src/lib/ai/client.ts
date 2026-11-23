import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export class AIError extends Error {
  constructor(
    public code: "refused" | "invalid_output" | "api_error" | "not_configured",
    message: string,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AIError("not_configured", "ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ timeout: 110_000, maxRetries: 2 });
  return client;
}

/** Server-side refusal fallback (on by default; CLAUDE_FALLBACK=off to disable). */
export function fallbackParams() {
  return process.env.CLAUDE_FALLBACK !== "off"
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
}

export const isMock = () => process.env.AI_MOCK === "1";

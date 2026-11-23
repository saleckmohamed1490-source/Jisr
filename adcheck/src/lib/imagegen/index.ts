import "server-only";
import { mockProvider } from "./mock";
import { openaiProvider } from "./openai";
import { replicateProvider } from "./replicate";
import type { ImageProvider } from "./types";

export { ImageGenError } from "./types";

const providers: Record<string, ImageProvider> = {
  openai: openaiProvider,
  replicate: replicateProvider,
  mock: mockProvider,
};

/** Pick the provider with IMAGE_PROVIDER=openai|replicate|mock (default: openai). */
export function getImageProvider(): ImageProvider {
  const name = (process.env.IMAGE_PROVIDER || "openai").toLowerCase();
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown IMAGE_PROVIDER "${name}"`);
  return provider;
}

/** Guard rails appended to every prompt, whatever the model suggested. */
export function buildImagePrompt(modelPrompt: string): string {
  return [
    modelPrompt.trim(),
    "Style: clean, professional social-media advertising photo, square 1:1 composition, natural lighting.",
    "Strict rules: no text or letters in the image, no logos or brand marks, no before/after or side-by-side comparison,",
    "no close-ups of body parts, no measuring tapes or scales, people (if any) fully clothed in a neutral, positive context,",
    "no medical imagery, no money or wealth imagery.",
  ].join(" ");
}

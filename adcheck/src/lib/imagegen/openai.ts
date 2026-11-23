import "server-only";
import { ImageGenError, type ImageProvider } from "./types";

/** OpenAI Images API (gpt-image-1 by default). */
export const openaiProvider: ImageProvider = {
  name: "openai",
  async generate(prompt) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ImageGenError("OPENAI_API_KEY is not set");

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
      signal: AbortSignal.timeout(110_000),
    });
    if (!res.ok) throw new ImageGenError(`OpenAI images error ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = json.data?.[0];
    if (item?.b64_json) {
      return { bytes: new Uint8Array(Buffer.from(item.b64_json, "base64")), mediaType: "image/png" };
    }
    if (item?.url) {
      const img = await fetch(item.url);
      return { bytes: new Uint8Array(await img.arrayBuffer()), mediaType: "image/png" };
    }
    throw new ImageGenError("OpenAI returned no image");
  },
};

import "server-only";
import { ImageGenError, type ImageProvider } from "./types";

type Prediction = {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
};

/** Replicate, Flux by default (black-forest-labs/flux-schnell; set REPLICATE_MODEL to change). */
export const replicateProvider: ImageProvider = {
  name: "replicate",
  async generate(prompt) {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new ImageGenError("REPLICATE_API_TOKEN is not set");
    const model = process.env.REPLICATE_MODEL || "black-forest-labs/flux-schnell";
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: { ...headers, Prefer: "wait=60" },
      body: JSON.stringify({ input: { prompt, aspect_ratio: "1:1", output_format: "png" } }),
      signal: AbortSignal.timeout(70_000),
    });
    if (!res.ok) throw new ImageGenError(`Replicate error ${res.status}: ${await res.text()}`);
    let prediction = (await res.json()) as Prediction;

    // If the synchronous wait wasn't enough, poll for up to ~40 more seconds.
    for (let i = 0; i < 20 && !["succeeded", "failed", "canceled"].includes(prediction.status); i++) {
      if (!prediction.urls?.get) break;
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(prediction.urls.get, { headers });
      prediction = (await poll.json()) as Prediction;
    }
    if (prediction.status !== "succeeded") {
      throw new ImageGenError(`Replicate prediction ${prediction.status}: ${prediction.error ?? ""}`);
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) throw new ImageGenError("Replicate returned no image");
    const img = await fetch(url);
    if (!img.ok) throw new ImageGenError(`Could not download Replicate output (${img.status})`);
    return { bytes: new Uint8Array(await img.arrayBuffer()), mediaType: "image/png" };
  },
};

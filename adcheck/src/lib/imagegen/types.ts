export type GeneratedImage = {
  bytes: Uint8Array;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export interface ImageProvider {
  readonly name: string;
  generate(prompt: string): Promise<GeneratedImage>;
}

export class ImageGenError extends Error {}

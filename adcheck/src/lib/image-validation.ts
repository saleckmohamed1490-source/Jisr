export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const EXTENSION_BY_TYPE: Record<ImageMediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Detect the real image type from the file's magic bytes. The client-provided
 * MIME type and file name are never trusted.
 */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageCheck =
  | { ok: true; mediaType: ImageMediaType }
  | { ok: false; error: "imageRequired" | "imageSize" | "imageType" };

export function validateImageBytes(bytes: Uint8Array | null | undefined): ImageCheck {
  if (!bytes || bytes.length === 0) return { ok: false, error: "imageRequired" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "imageSize" };
  const mediaType = sniffImageType(bytes);
  if (!mediaType) return { ok: false, error: "imageType" };
  return { ok: true, mediaType };
}

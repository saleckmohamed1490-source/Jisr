import "server-only";
import sharp from "sharp";

/**
 * Users may upload up to 10MB, but the Claude API accepts at most 5MB per
 * image and gains nothing above ~1568px on the long edge. Re-encode to a JPEG
 * that fits comfortably, which also strips metadata (EXIF/GPS).
 */
export async function prepareImageForModel(bytes: Uint8Array): Promise<{ base64: string; mediaType: "image/jpeg" }> {
  const out = await sharp(bytes, { failOn: "error" })
    .rotate() // honour EXIF orientation
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return { base64: out.toString("base64"), mediaType: "image/jpeg" };
}

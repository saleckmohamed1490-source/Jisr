import { NextResponse, type NextRequest } from "next/server";
import { analyzeAd, AnalysisError } from "@/lib/analysis/analyze";
import { validateImageBytes } from "@/lib/image-validation";
import { CheckFieldsSchema, parseLocale } from "@/lib/validation";
import { memoryRateLimit } from "@/lib/rate-limit-memory";
import { defaultLocale } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const maxDuration = 120;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!memoryRateLimit(`check:${ip}`, 5, 60_000)) return fail("rateLimited", 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("imageRequired", 400);
  }

  const fields = CheckFieldsSchema.safeParse({
    adText: form.get("adText") ?? "",
    product: form.get("product") ?? "",
  });
  if (!fields.success) return fail(fields.error.issues[0].message, 400);

  const file = form.get("image");
  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
  const image = validateImageBytes(bytes);
  if (!image.ok) return fail(image.error, 400);

  const locale = parseLocale(form.get("locale"), defaultLocale);

  try {
    const { analysis } = await analyzeAd({
      image: { base64: Buffer.from(bytes!).toString("base64"), mediaType: image.mediaType },
      adText: fields.data.adText,
      product: fields.data.product,
      locale,
    });
    return NextResponse.json({ analysis });
  } catch (err) {
    if (err instanceof AnalysisError) {
      console.error("[api/check]", err.code, err.message);
      return fail("aiFailed", err.code === "not_configured" ? 503 : 502);
    }
    console.error("[api/check] unexpected", err);
    return fail("aiFailed", 500);
  }
}

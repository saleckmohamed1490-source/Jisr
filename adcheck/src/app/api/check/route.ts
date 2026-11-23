import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { analyzeAd, AnalysisError } from "@/lib/analysis/analyze";
import { validateImageBytes } from "@/lib/image-validation";
import { CheckFieldsSchema, parseLocale } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { consumeCredit, refundCredit } from "@/lib/credits";
import { routing } from "@/i18n/routing";
import { fetchLandingPage } from "@/lib/analysis/landing-page";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGES_BUCKET } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  imagePath: z.string().max(200),
  adText: z.string(),
  product: z.string(),
  landingUrl: z.string().optional(),
  workspaceId: z.uuid().optional(),
  locale: z.string().optional(),
});

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * The browser uploads the image straight to Supabase Storage (this avoids the
 * ~4.5MB request-body limit of serverless functions) and then calls this
 * route with the storage path.
 */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return fail("unauthorized", 401);

  if (!(await rateLimit(user.id, "check"))) return fail("rateLimited", 429);

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("imageRequired", 400);

  const fields = CheckFieldsSchema.safeParse(body.data);
  if (!fields.success) return fail(fields.error.issues[0].message, 400);

  // The image must live in the caller's own folder.
  const { imagePath } = body.data;
  const pathOk = new RegExp(`^${user.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(imagePath);
  if (!pathOk) return fail("imageRequired", 400);

  const admin = createAdminClient();
  const { data: blob, error: dlError } = await admin.storage.from(IMAGES_BUCKET).download(imagePath);
  if (dlError || !blob) return fail("imageRequired", 400);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const image = validateImageBytes(bytes);
  if (!image.ok) {
    await admin.storage.from(IMAGES_BUCKET).remove([imagePath]);
    return fail(image.error, 400);
  }

  const locale = parseLocale(body.data.locale, routing.defaultLocale);

  // A workspace, if given, must belong to the caller.
  const workspaceId = body.data.workspaceId ?? null;
  if (workspaceId) {
    const { data: ws } = await admin
      .from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", user.id).maybeSingle();
    if (!ws) return fail("imageRequired", 400);
  }

  // Deduct the credit BEFORE calling the AI (atomic in the DB, so parallel
  // requests can't overspend), and refund it if anything below fails.
  if (!(await consumeCredit(user.id, "check"))) return fail("noCredits", 402);

  let result;
  try {
    const landing = fields.data.landingUrl ? await fetchLandingPage(fields.data.landingUrl) : null;
    result = await analyzeAd({
      imageBytes: bytes,
      adText: fields.data.adText,
      product: fields.data.product,
      locale,
      landing,
    });
  } catch (err) {
    console.error("[api/check]", err instanceof AnalysisError ? err.code : "unexpected", err);
    await refundCredit(user.id, "check");
    return fail("aiFailed", 502);
  }

  const { analysis, model } = result;
  const { data: row, error: insertError } = await admin
    .from("checks")
    .insert({
      user_id: user.id,
      image_path: imagePath,
      ad_text: fields.data.adText,
      product_description: fields.data.product,
      landing_url: fields.data.landingUrl ?? null,
      workspace_id: workspaceId,
      locale,
      verdict: analysis.verdict,
      risk_score: analysis.risk_score,
      report: analysis,
      model,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) {
    console.error("[api/check] insert failed", insertError);
    await refundCredit(user.id, "check");
    return fail("aiFailed", 500);
  }

  return NextResponse.json({ id: row.id });
}

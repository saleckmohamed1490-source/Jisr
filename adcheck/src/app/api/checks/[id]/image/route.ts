import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGES_BUCKET } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { consumeCredit, refundCredit } from "@/lib/credits";
import { buildImagePrompt, getImageProvider } from "@/lib/imagegen";
import { EXTENSION_BY_TYPE, validateImageBytes } from "@/lib/image-validation";
import { AnalysisSchema } from "@/lib/analysis/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** "Create a compliant image for me" — Pro plan, one image credit per image. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/checks/[id]/image">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return fail("unauthorized", 401);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("notFound", 404);

  const admin = createAdminClient();
  const [{ data: profile }, { data: check }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", user.id).single<{ plan: string }>(),
    admin
      .from("checks")
      .select("id, report")
      .eq("id", id)
      .eq("user_id", user.id) // ownership check: service role bypasses RLS
      .maybeSingle<{ id: string; report: unknown }>(),
  ]);
  if (!check) return fail("notFound", 404);
  if (profile?.plan !== "pro") return fail("imageProOnly", 403);

  const report = AnalysisSchema.safeParse(check.report);
  if (!report.success) return fail("imageFailed", 500);

  if (!(await rateLimit(user.id, "image"))) return fail("rateLimited", 429);
  if (!(await consumeCredit(user.id, "image"))) return fail("noImageCredits", 402);

  const provider = getImageProvider();
  const prompt = buildImagePrompt(report.data.image_prompt);
  try {
    const image = await provider.generate(prompt);
    const valid = validateImageBytes(image.bytes);
    if (!valid.ok) throw new Error(`provider returned an invalid image (${valid.error})`);

    const path = `${user.id}/generated/${crypto.randomUUID()}.${EXTENSION_BY_TYPE[valid.mediaType]}`;
    const { error: upErr } = await admin.storage
      .from(IMAGES_BUCKET)
      .upload(path, image.bytes, { contentType: valid.mediaType, upsert: false });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await admin
      .from("generated_images")
      .insert({ user_id: user.id, check_id: check.id, image_path: path, prompt, provider: provider.name })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !row) throw insErr ?? new Error("insert failed");

    const { data: signed } = await admin.storage.from(IMAGES_BUCKET).createSignedUrl(path, 3600);
    return NextResponse.json({ id: row.id, url: signed?.signedUrl ?? null });
  } catch (err) {
    console.error("[api/image] generation failed", provider.name, err);
    await refundCredit(user.id, "image");
    return fail("imageFailed", 502);
  }
}

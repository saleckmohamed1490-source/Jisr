import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { consumeCredit, refundCredit } from "@/lib/credits";
import { AppealInputSchema } from "@/lib/appeals/schema";
import { generateAppeal } from "@/lib/appeals/generate";
import { AnalysisSchema } from "@/lib/analysis/schema";
import { isLocale, routing } from "@/i18n/routing";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return fail("unauthorized", 401);
  if (!(await rateLimit(user.id, "appeal"))) return fail("rateLimited", 429);

  const json = await req.json().catch(() => null);
  const parsed = AppealInputSchema.safeParse(json);
  if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
  const input = parsed.data;
  const uiLocale = isLocale(json?.locale) ? json.locale : routing.defaultLocale;

  const admin = createAdminClient();
  let report = null;
  if (input.checkId) {
    const { data } = await admin
      .from("checks").select("report").eq("id", input.checkId).eq("user_id", user.id).maybeSingle<{ report: unknown }>();
    if (!data) return fail("notFound", 404);
    const r = AnalysisSchema.safeParse(data.report);
    report = r.success ? r.data : null;
  }

  if (!(await consumeCredit(user.id, "appeal"))) return fail("noAppealCredits", 402);

  try {
    const { appeal, model } = await generateAppeal(input, uiLocale, report);
    const { data: row, error } = await admin
      .from("appeals")
      .insert({
        user_id: user.id,
        check_id: input.checkId ?? null,
        rejection_reason: input.rejectionReason,
        ad_text: input.adText || null,
        product_description: input.product || null,
        changes_made: input.changesMade || null,
        letter_language: input.letterLanguage,
        ui_locale: uiLocale,
        result: appeal,
        model,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !row) throw error ?? new Error("insert failed");
    return NextResponse.json({ id: row.id });
  } catch (err) {
    console.error("[api/appeals]", err);
    await refundCredit(user.id, "appeal");
    return fail("aiFailed", 502);
  }
}

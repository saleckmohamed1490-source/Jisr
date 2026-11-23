"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, isDuration, isPaidPlan } from "@/lib/plans";
import { isAdminEmail } from "./is-admin";

export type ActivateState =
  | { ok: true; email: string; until: string }
  | { ok: false; error: "forbidden" | "invalid" | "user_not_found" | "order_not_found" | "already_active" | "failed" }
  | null;

const Input = z.object({
  email: z.email(),
  plan: z.string().refine(isPaidPlan),
  months: z.coerce.number().refine(isDuration),
  orderId: z.string().trim().max(64).optional(),
  note: z.string().trim().max(300).optional(),
});

/**
 * Manually activate a subscription (e.g. a payment problem). If an order ID is
 * given, that existing payment is marked as paid and activated (once);
 * otherwise a "manual" payment row is recorded for the audit trail.
 */
export async function manualActivate(_: ActivateState, form: FormData): Promise<ActivateState> {
  const me = await getUser();
  if (!isAdminEmail(me?.email)) return { ok: false, error: "forbidden" };

  const parsed = Input.safeParse({
    email: form.get("email"),
    plan: form.get("plan"),
    months: form.get("months"),
    orderId: form.get("orderId") || undefined,
    note: form.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { email, plan, months, orderId, note } = parsed.data as { email: string; plan: "pro"; months: 1; orderId?: string; note?: string };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle<{ id: string }>();
  if (!profile) return { ok: false, error: "user_not_found" };

  const auditNote = `manual by ${me!.email}${note ? `: ${note}` : ""}`;
  let paymentId: string;
  if (orderId) {
    const { data: pay } = await admin
      .from("payments").select("id, activated_at, user_id").eq("order_id", orderId).maybeSingle<{ id: string; activated_at: string | null; user_id: string }>();
    if (!pay || pay.user_id !== profile.id) return { ok: false, error: "order_not_found" };
    if (pay.activated_at) return { ok: false, error: "already_active" };
    await admin.from("payments").update({ status: "finished", plan, months, note: auditNote }).eq("id", pay.id);
    paymentId = pay.id;
  } else {
    const { data: row, error } = await admin
      .from("payments")
      .insert({
        user_id: profile.id,
        order_id: `manual_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
        provider: "manual",
        plan,
        months,
        price_usd: 0,
        status: "finished",
        note: auditNote,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !row) return { ok: false, error: "failed" };
    paymentId = row.id;
  }

  const q = PLANS[plan];
  const { data: until, error } = await admin.rpc("activate_payment", {
    p_payment: paymentId, p_checks: q.checks, p_images: q.images, p_appeals: q.appeals,
  });
  if (error) return { ok: false, error: "failed" };
  if (!until) return { ok: false, error: "already_active" };
  revalidatePath("/[locale]/admin", "page");
  return { ok: true, email, until: until as string };
}

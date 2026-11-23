import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PaidPlanId } from "@/lib/plans";
import { sendEmail } from "@/lib/email/send";
import { expiredEmail, renewalReminderEmail } from "@/lib/email/templates";

const DAY = 24 * 60 * 60 * 1000;

type Contact = { email: string | null; locale: string };

async function contactsFor(userIds: string[]): Promise<Map<string, Contact>> {
  if (userIds.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, email, locale").in("id", userIds);
  return new Map((data ?? []).map((r: { id: string } & Contact) => [r.id, { email: r.email, locale: r.locale }]));
}

/** 1) Subscriptions past their end date go back to Free. */
export async function expireSubscriptions() {
  const { data, error } = await createAdminClient().rpc("expire_due_subscriptions");
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; plan: PaidPlanId }[];
  const contacts = await contactsFor(rows.map((r) => r.user_id));
  for (const r of rows) {
    const c = contacts.get(r.user_id);
    if (c?.email) await sendEmail(await expiredEmail(c.email, c.locale, { plan: r.plan }));
  }
  return rows.length;
}

/** 2) Credits renew every 30 days from activation while the plan is active. */
export async function renewDueCredits() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, plan")
    .neq("plan", "free")
    .lte("credits_renew_at", new Date().toISOString());
  if (error) throw error;
  let renewed = 0;
  for (const p of (data ?? []) as { id: string; plan: PaidPlanId }[]) {
    const q = PLANS[p.plan];
    const { data: ok } = await admin.rpc("renew_credits_if_due", {
      p_user: p.id,
      p_checks: q.checks,
      p_images: q.images,
      p_appeals: q.appeals,
    });
    if (ok) renewed++;
  }
  return renewed;
}

/**
 * 3) Reminders 3 days and 1 day before the end, each sent once per period
 * (the flags are reset when the subscription is extended). The flag is set
 * BEFORE sending ("claim"), so two overlapping runs never double-send.
 */
export async function sendRenewalReminders() {
  const admin = createAdminClient();
  const now = Date.now();
  let sent = 0;

  for (const [days, column] of [
    [1, "reminder_1d_sent_at"],
    [3, "reminder_3d_sent_at"],
  ] as const) {
    const { data, error } = await admin
      .from("subscriptions")
      .update({ [column]: new Date().toISOString(), ...(days === 1 ? { reminder_3d_sent_at: new Date().toISOString() } : {}) })
      .eq("status", "active")
      .is(column, null)
      .gt("current_period_end", new Date(now).toISOString())
      .lte("current_period_end", new Date(now + days * DAY).toISOString())
      .select("user_id, plan, current_period_end");
    if (error) throw error;

    const rows = (data ?? []) as { user_id: string; plan: PaidPlanId; current_period_end: string }[];
    const contacts = await contactsFor(rows.map((r) => r.user_id));
    for (const r of rows) {
      const c = contacts.get(r.user_id);
      if (!c?.email) continue;
      const endsAt = new Date(r.current_period_end);
      const daysLeft = Math.max(1, Math.ceil((endsAt.getTime() - now) / DAY));
      await sendEmail(await renewalReminderEmail(c.email, c.locale, { plan: r.plan, endsAt, daysLeft }));
      sent++;
    }
  }
  return sent;
}

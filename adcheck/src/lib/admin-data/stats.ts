import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PaymentRow } from "@/lib/payments/service";

export type AdminStats = {
  users: number;
  activeByPlan: Record<string, number>;
  activeTotal: number;
  revenueThisMonth: number;
  revenue30d: number;
  pendingPayments: number;
  latestPayments: (PaymentRow & { email: string | null; note: string | null })[];
};

/** Service-role reads: only call after checking the caller is an admin. */
export async function getAdminStats(): Promise<AdminStats> {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [users, subs, month, last30, pending, latest] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("subscriptions").select("plan").eq("status", "active").gt("current_period_end", now.toISOString()),
    admin.from("payments").select("price_usd").not("activated_at", "is", null).neq("provider", "manual").gte("activated_at", monthStart),
    admin.from("payments").select("price_usd").not("activated_at", "is", null).neq("provider", "manual").gte("activated_at", since30),
    admin.from("payments").select("id", { count: "exact", head: true }).in("status", ["pending", "waiting", "confirming", "confirmed", "sending", "partially_paid"]),
    admin.from("payments").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  const activeByPlan: Record<string, number> = { starter: 0, pro: 0, agency: 0 };
  for (const s of (subs.data ?? []) as { plan: string }[]) activeByPlan[s.plan] = (activeByPlan[s.plan] ?? 0) + 1;
  const sum = (rows: { price_usd: number }[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.price_usd), 0);

  const payments = (latest.data ?? []) as (PaymentRow & { note: string | null })[];
  const ids = [...new Set(payments.map((p) => p.user_id))];
  const { data: emails } = ids.length
    ? await admin.from("profiles").select("id, email").in("id", ids)
    : { data: [] as { id: string; email: string | null }[] };
  const emailOf = new Map((emails ?? []).map((e: { id: string; email: string | null }) => [e.id, e.email]));

  return {
    users: users.count ?? 0,
    activeByPlan,
    activeTotal: Object.values(activeByPlan).reduce((a, b) => a + b, 0),
    revenueThisMonth: sum(month.data as { price_usd: number }[]),
    revenue30d: sum(last30.data as { price_usd: number }[]),
    pendingPayments: pending.count ?? 0,
    latestPayments: payments.map((p) => ({ ...p, email: emailOf.get(p.user_id) ?? null })),
  };
}

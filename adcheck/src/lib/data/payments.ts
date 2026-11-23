import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PaymentRow } from "@/lib/payments/service";

/** The signed-in user's payments (RLS: own rows only). */
export async function listMyPayments(limit = 50): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as PaymentRow[];
}

export async function getMyPayment(id: string): Promise<PaymentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  return (data as PaymentRow) ?? null;
}

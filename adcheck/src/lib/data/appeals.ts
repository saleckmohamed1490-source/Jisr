import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Appeal } from "@/lib/appeals/schema";

export type AppealRow = {
  id: string;
  check_id: string | null;
  rejection_reason: string;
  letter_language: string;
  result: Appeal;
  created_at: string;
};

export async function listMyAppeals(limit = 50): Promise<AppealRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appeals")
    .select("id, check_id, rejection_reason, letter_language, result, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AppealRow[];
}

export async function getMyAppeal(id: string): Promise<AppealRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("appeals")
    .select("id, check_id, rejection_reason, letter_language, result, created_at")
    .eq("id", id)
    .maybeSingle();
  return (data as AppealRow) ?? null;
}

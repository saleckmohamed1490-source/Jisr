import "server-only";
import { createClient } from "@/lib/supabase/server";
import { IMAGES_BUCKET } from "@/lib/supabase/env";
import type { Analysis, Verdict } from "@/lib/analysis/schema";

export type CheckSummary = {
  id: string;
  verdict: Verdict;
  risk_score: number;
  ad_text: string;
  created_at: string;
};

export type CheckDetail = CheckSummary & {
  product_description: string;
  landing_url: string | null;
  image_path: string;
  report: Analysis;
  locale: string;
};

/** Reads go through the user's own client, so RLS restricts them to their rows. */
export async function listChecks(limit = 20): Promise<CheckSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .select("id, verdict, risk_score, ad_text, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CheckSummary[];
}

export async function getCheck(id: string): Promise<CheckDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .select("id, verdict, risk_score, ad_text, product_description, landing_url, image_path, report, locale, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as CheckDetail) ?? null;
}

export async function signedImageUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(IMAGES_BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export type GeneratedImageRow = { id: string; url: string; created_at: string };

export async function listGeneratedImages(checkId: string): Promise<GeneratedImageRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("generated_images")
    .select("id, image_path, created_at")
    .eq("check_id", checkId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; image_path: string; created_at: string }[];
  if (rows.length === 0) return [];
  const { data: signed } = await supabase.storage
    .from(IMAGES_BUCKET)
    .createSignedUrls(rows.map((r) => r.image_path), 3600);
  return rows
    .map((r, i) => ({ id: r.id, created_at: r.created_at, url: signed?.[i]?.signedUrl ?? "" }))
    .filter((r) => r.url);
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use only in server code, after checking
 * who the user is. All credit changes go through this client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  admin ??= createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

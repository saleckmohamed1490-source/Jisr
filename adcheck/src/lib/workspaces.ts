import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Workspace = { id: string; name: string };

export async function listMyWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select("id, name").order("created_at");
  return (data ?? []) as Workspace[];
}

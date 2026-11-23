"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

export type WorkspaceState = { error?: "limit" | "name" } | null;

/** Agency plans get up to PLANS.agency.workspaces client workspaces. Enforced here, server-side. */
export async function createWorkspace(_: WorkspaceState, form: FormData): Promise<WorkspaceState> {
  const user = await getUser();
  if (!user) return { error: "limit" };
  const name = z.string().trim().min(1).max(60).safeParse(form.get("name"));
  if (!name.success) return { error: "name" };

  const admin = createAdminClient();
  const [{ data: profile }, { count }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", user.id).single<{ plan: PlanId }>(),
    admin.from("workspaces").select("id", { count: "exact", head: true }).eq("owner_id", user.id),
  ]);
  const max = PLANS[profile?.plan ?? "free"].workspaces;
  if (max <= 1 || (count ?? 0) >= max) return { error: "limit" };

  await admin.from("workspaces").insert({ owner_id: user.id, name: name.data });
  revalidatePath("/[locale]/dashboard", "page");
  return null;
}

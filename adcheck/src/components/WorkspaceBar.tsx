"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createWorkspace, type WorkspaceState } from "@/lib/workspace-actions";
import type { Workspace } from "@/lib/workspaces";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/** Agency plan: switch between client workspaces and create new ones (limit enforced server-side). */
export function WorkspaceBar({ workspaces, current, max }: { workspaces: Workspace[]; current: string | null; max: number }) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<WorkspaceState, FormData>(createWorkspace, null);
  const pill = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "bg-white hover:bg-muted");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("workspaces")} ({workspaces.length}/{max}):</span>
        <Link href="/dashboard" className={pill(!current)}>{t("allWorkspaces")}</Link>
        {workspaces.map((w) => (
          <Link key={w.id} href={`/dashboard?ws=${w.id}`} className={pill(current === w.id)}>{w.name}</Link>
        ))}
        {workspaces.length < max && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}><Plus />{t("newWorkspace")}</Button>
        )}
      </div>
      {open && (
        <form action={action} className="flex max-w-md gap-2">
          <Input name="name" maxLength={60} required placeholder={t("workspaceName")} aria-label={t("workspaceName")} />
          <Button type="submit" disabled={pending}>{t("create")}</Button>
        </form>
      )}
      {state?.error && <Alert variant="destructive">{state.error === "limit" ? t("workspaceLimit") : t("workspaceNameError")}</Alert>}
    </div>
  );
}

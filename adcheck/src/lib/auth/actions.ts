"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext, siteUrl } from "@/lib/site-url";

export type AuthState = { error?: "invalidCredentials" | "passwordHint" | "genericError"; info?: "checkEmail" } | null;

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalidCredentials" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalidCredentials" };
  redirect(safeNext(form.get("next")));
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "passwordHint" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=/dashboard` },
  });
  if (error) return { error: "genericError" };
  // When email confirmation is disabled Supabase returns a session right away.
  if (data.session) redirect("/dashboard");
  return { info: "checkEmail" };
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createClient();
  const next = safeNext(form.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

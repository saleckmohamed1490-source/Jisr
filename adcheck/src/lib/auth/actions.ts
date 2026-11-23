"use server";

import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getPathname, redirect } from "@/i18n/navigation";
import { isLocale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext, siteUrl } from "@/lib/site-url";

export type AuthState = { error?: "invalidCredentials" | "passwordHint" | "genericError"; info?: "checkEmail" } | null;

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

/** `next` values are locale-free paths ("/dashboard"); add the current locale prefix. */
async function localized(path: string) {
  return getPathname({ href: path, locale: await getLocale() });
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalidCredentials" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalidCredentials" };
  await rememberLocale(data.user.id);
  redirect({ href: safeNext(form.get("next")), locale: await getLocale() });
  return null;
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "passwordHint" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(await localized("/dashboard"))}` },
  });
  if (error) return { error: "genericError" };
  if (data.user) await rememberLocale(data.user.id);
  // When email confirmation is disabled Supabase returns a session right away.
  if (data.session) redirect({ href: "/dashboard", locale: await getLocale() });
  return { info: "checkEmail" };
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createClient();
  const next = await localized(safeNext(form.get("next")));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect({ href: "/login?error=oauth", locale: await getLocale() });
  nextRedirect(data.url!);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/", locale: await getLocale() });
}

/** Store the UI language on the profile so e-mails go out in the same language. */
async function rememberLocale(userId: string) {
  const locale = await getLocale();
  await createAdminClient().from("profiles").update({ locale }).eq("id", userId);
}

export async function saveLocalePreference(locale: string) {
  if (!isLocale(locale)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await createAdminClient().from("profiles").update({ locale }).eq("id", data.user.id);
}

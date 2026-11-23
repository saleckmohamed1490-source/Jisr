"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signInWithGoogle, signup, type AuthState } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";

export function AuthForm({
  mode,
  t,
  next,
  oauthError,
}: {
  mode: "login" | "signup";
  t: Dictionary;
  next?: string;
  oauthError?: boolean;
}) {
  const a = t.auth;
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, null);
  const error = state?.error ?? (oauthError ? "genericError" : undefined);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{mode === "login" ? a.loginTitle : a.signupTitle}</h1>

        <form action={signInWithGoogle} className="mt-6">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 font-medium hover:bg-slate-50"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {a.google}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          {a.or}
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <div>
            <label htmlFor="email" className="block text-sm font-medium">{a.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" dir="ltr"
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 focus:border-brand-500 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">{a.password}</label>
            <input id="password" name="password" type="password" required minLength={8} dir="ltr"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 focus:border-brand-500 focus:outline-none" />
            {mode === "signup" && <p className="mt-1 text-xs text-slate-500">{a.passwordHint}</p>}
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{a[error]}</p>}
          {state?.info && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{a[state.info]}</p>}
          <button type="submit" disabled={pending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {mode === "login" ? a.loginButton : a.signupButton}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {mode === "login" ? a.noAccount : a.haveAccount}{" "}
          <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-brand-600 hover:underline">
            {mode === "login" ? t.nav.signup : t.nav.login}
          </Link>
        </p>
      </div>
    </div>
  );
}

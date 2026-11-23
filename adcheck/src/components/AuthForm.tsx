"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { login, signInWithGoogle, signup, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/brand";

export function AuthForm({ mode, next, oauthError }: { mode: "login" | "signup"; next?: string; oauthError?: boolean }) {
  const a = useTranslations("auth");
  const nav = useTranslations("nav");
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? login : signup, null);
  const error = state?.error ?? (oauthError ? "genericError" : undefined);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{mode === "login" ? a("loginTitle", { app: APP_NAME }) : a("signupTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <Button type="submit" variant="outline" className="w-full" size="lg">
              <svg aria-hidden viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {a("google")}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            {a("or")}
            <Separator className="flex-1" />
          </div>

          <form action={action} className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <div className="space-y-1.5">
              <Label htmlFor="email">{a("email")}</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{a("password")}</Label>
              <Input id="password" name="password" type="password" required minLength={8} dir="ltr"
                autoComplete={mode === "login" ? "current-password" : "new-password"} />
              {mode === "signup" && <p className="text-xs text-muted-foreground">{a("passwordHint")}</p>}
            </div>
            {error && <Alert variant="destructive">{a(error)}</Alert>}
            {state?.info && <Alert variant="success" role="status">{a(state.info)}</Alert>}
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {mode === "login" ? a("loginButton") : a("signupButton")}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? a("noAccount") : a("haveAccount")}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-primary hover:underline">
              {mode === "login" ? nav("signup") : nav("login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

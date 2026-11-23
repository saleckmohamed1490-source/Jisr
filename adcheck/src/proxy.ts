import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

const PROTECTED = ["/dashboard", "/check", "/reports", "/appeals", "/billing", "/admin"];
const AUTH_PAGES = ["/login", "/signup"];

/** "/ar/dashboard" -> { locale: "ar", path: "/dashboard" } */
function splitLocale(pathname: string): { prefix: string; path: string } {
  const first = pathname.split("/")[1];
  if ((routing.locales as readonly string[]).includes(first) && first !== routing.defaultLocale) {
    return { prefix: `/${first}`, path: pathname.slice(first.length + 1) || "/" };
  }
  return { prefix: "", path: pathname };
}

/**
 * Next.js 16 `proxy` (formerly middleware):
 * 1. next-intl resolves the locale and rewrites/redirects the URL;
 * 2. the Supabase session cookie is refreshed on that same response;
 * 3. private pages require a signed-in user.
 */
export async function proxy(request: NextRequest) {
  const response = intl(request);

  // next-intl may answer with a redirect (e.g. to the visitor's language).
  if (response.headers.get("location")) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { prefix, path } = splitLocale(request.nextUrl.pathname);
  const redirectTo = (target: string) => {
    const dest = request.nextUrl.clone();
    dest.pathname = `${prefix}${target}`;
    dest.search = target.startsWith("/login") ? `?next=${encodeURIComponent(path)}` : "";
    const res = NextResponse.redirect(dest);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) return redirectTo("/login");
  if (user && AUTH_PAGES.includes(path)) return redirectTo("/dashboard");
  return response;
}

export const config = {
  // Pages only: skip API routes, the auth callback, Next internals and files with an extension.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};

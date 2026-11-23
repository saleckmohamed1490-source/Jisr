import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/reports", "/billing"];
const AUTH_PAGES = ["/login", "/signup"];

/**
 * Refreshes the Supabase session cookie on every request and guards private
 * pages. (Next.js 16 renamed `middleware` to `proxy`.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  if (user && AUTH_PAGES.includes(path)) {
    const dash = request.nextUrl.clone();
    dash.pathname = "/dashboard";
    dash.search = "";
    return NextResponse.redirect(dash);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images and API webhooks.
    "/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import "server-only";
import { headers } from "next/headers";

/** Public base URL of the app (used for OAuth / email / checkout redirects). */
export async function siteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allow relative, same-site redirect targets. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

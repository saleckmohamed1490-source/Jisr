import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const PUBLIC_PAGES = ["", "/pricing", "/how-to-pay-crypto", "/terms", "/privacy", "/refund", "/login", "/signup"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const url = (locale: string, page: string) =>
    `${base}${locale === routing.defaultLocale ? "" : `/${locale}`}${page}` || base;
  return PUBLIC_PAGES.map((page) => ({
    url: url(routing.defaultLocale, page) || base,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, page) || base])) },
  }));
}

import { defineRouting } from "next-intl/routing";

/**
 * To add a language: add its code here, add `messages/<code>.json`
 * (copy en.json and translate), and add its display name in `localeNames`.
 * Right-to-left languages also go in `rtlLocales`.
 */
export const routing = defineRouting({
  locales: ["en", "ar", "fr"],
  defaultLocale: "en",
  // English lives at "/", the others at "/ar", "/fr".
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
};

const rtlLocales: readonly string[] = ["ar"];

export function dirOf(locale: string): "rtl" | "ltr" {
  return rtlLocales.includes(locale) ? "rtl" : "ltr";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (routing.locales as readonly string[]).includes(value);
}

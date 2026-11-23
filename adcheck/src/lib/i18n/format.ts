import type { Locale } from "./config";

const intlLocale: Record<Locale, string> = { ar: "ar-u-nu-latn", fr: "fr-FR", en: "en-US" };

export function formatDate(value: string | Date, locale: Locale, withTime = false): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

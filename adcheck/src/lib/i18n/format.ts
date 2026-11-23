const intlLocale: Record<string, string> = { ar: "ar-u-nu-latn", fr: "fr-FR", en: "en-US" };

/** Dates with Latin digits in every language (easier to read for amounts and invoices). */
export function formatDate(value: string | Date, locale: string, withTime = false): string {
  return new Intl.DateTimeFormat(intlLocale[locale] ?? locale, {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

export function formatUsd(amount: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale[locale] ?? locale, { style: "currency", currency: "USD" }).format(amount);
}

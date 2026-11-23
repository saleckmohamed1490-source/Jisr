"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, routing, type Locale } from "@/i18n/routing";
import { saveLocalePreference } from "@/lib/auth/actions";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={t("language")}
      value={locale}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Locale;
        startTransition(async () => {
          // Remember the choice on the account (used for e-mails); ignored when signed out.
          await saveLocalePreference(next).catch(() => {});
          router.replace(pathname, { locale: next });
        });
      }}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}

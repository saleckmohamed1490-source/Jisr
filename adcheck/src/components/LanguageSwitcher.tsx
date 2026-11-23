"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import { localeNames, locales, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

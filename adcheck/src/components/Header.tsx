import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { signOut } from "@/lib/auth/actions";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header({ locale, t, signedIn }: { locale: Locale; t: Dictionary; signedIn: boolean }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-700">
          {t.common.appName}
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/#pricing" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
            {t.nav.pricing}
          </Link>
          {signedIn ? (
            <>
              <Link href="/dashboard" className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">
                {t.nav.dashboard}
              </Link>
              <Link href="/billing" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
                {t.nav.billing}
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-slate-600 hover:text-slate-900">{t.nav.logout}</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">{t.nav.login}</Link>
              <Link href="/signup" className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">
                {t.nav.signup}
              </Link>
            </>
          )}
          <LanguageSwitcher current={locale} label={t.common.language} />
        </nav>
      </div>
    </header>
  );
}

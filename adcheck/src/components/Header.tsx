import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";

export function Header({ signedIn, isAdmin = false }: { signedIn: boolean; isAdmin?: boolean }) {
  const t = useTranslations("nav");
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/pricing" className="hidden px-2 text-muted-foreground hover:text-foreground md:inline">{t("pricing")}</Link>
          {signedIn ? (
            <>
              <Link href="/appeals" className="hidden px-2 text-muted-foreground hover:text-foreground md:inline">{t("appeals")}</Link>
              <Link href="/billing" className="hidden px-2 text-muted-foreground hover:text-foreground md:inline">{t("billing")}</Link>
              {isAdmin && <Link href="/admin" className="hidden px-2 text-muted-foreground hover:text-foreground md:inline">{t("admin")}</Link>}
              <Button asChild size="sm"><Link href="/dashboard">{t("dashboard")}</Link></Button>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm" aria-label={t("logout")} title={t("logout")}>
                  <LogOut className="sm:hidden" />
                  <span className="hidden sm:inline">{t("logout")}</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link href="/login">{t("login")}</Link></Button>
              <Button asChild size="sm"><Link href="/signup">{t("signup")}</Link></Button>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import { Logo } from "./Logo";

export function Footer() {
  const t = useTranslations("footer");
  const tc = useTranslations("common");
  return (
    <footer className="mt-16 border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">{tc("disclaimer")}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/pricing" className="text-muted-foreground hover:text-foreground">{t("pricing")}</Link>
          <Link href="/how-to-pay-crypto" className="text-muted-foreground hover:text-foreground">{t("howToPay")}</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-muted-foreground hover:text-foreground">{t("support")}</a>
        </nav>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">{t("terms")}</Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">{t("privacy")}</Link>
          <Link href="/refund" className="text-muted-foreground hover:text-foreground">{t("refund")}</Link>
        </nav>
      </div>
      <p className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {APP_NAME}. {t("notAffiliated")}
      </p>
    </footer>
  );
}

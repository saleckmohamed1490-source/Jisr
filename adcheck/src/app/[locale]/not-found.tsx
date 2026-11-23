import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("common");
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <p className="mt-4 text-muted-foreground">{t("notFound")}</p>
      <Button asChild className="mt-6"><Link href="/">{t("home")}</Link></Button>
    </div>
  );
}

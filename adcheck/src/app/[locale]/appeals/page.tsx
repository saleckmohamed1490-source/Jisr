import { getTranslations } from "next-intl/server";
import { pageLocale } from "@/i18n/params";
import { Link, redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { listMyAppeals } from "@/lib/data/appeals";
import { formatDate } from "@/lib/i18n/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AppealsPage({ params }: PageProps<"/[locale]/appeals">) {
  const locale = await pageLocale(params);
  if (!(await getUser())) return redirect({ href: "/login?next=/appeals", locale });
  const [t, appeals] = await Promise.all([getTranslations("appeals"), listMyAppeals()]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild><Link href="/appeals/new">{t("new")}</Link></Button>
      </div>
      {appeals.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {appeals.map((a) => (
            <li key={a.id}>
              <Link href={`/appeals/${a.id}`}>
                <Card className="hover:bg-muted/40">
                  <CardContent className="pt-5">
                    <p className="font-medium" dir="auto">{a.result.subject}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" dir="auto">{a.rejection_reason}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDate(a.created_at, locale, true)}</p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

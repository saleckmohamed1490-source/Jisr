import type { Metadata } from "next";
import { pageLocale } from "@/i18n/params";
import { isLocale, routing } from "@/i18n/routing";
import { legalTitle, loadLegal } from "@/lib/legal";
import { Markdown } from "@/components/Markdown";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">): Promise<Metadata> {
  const { locale } = await params;
  return { title: legalTitle(await loadLegal("terms", isLocale(locale) ? locale : routing.defaultLocale)) };
}

export default async function Page({ params }: PageProps<"/[locale]/terms">) {
  const locale = await pageLocale(params);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Markdown source={await loadLegal("terms", locale)} />
    </article>
  );
}

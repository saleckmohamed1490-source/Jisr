import type { Metadata } from "next";
import { pageLocale } from "@/i18n/params";
import { isLocale, routing } from "@/i18n/routing";
import { legalTitle, loadLegal } from "@/lib/legal";
import { Markdown } from "@/components/Markdown";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return { title: legalTitle(await loadLegal("privacy", isLocale(locale) ? locale : routing.defaultLocale)) };
}

export default async function Page({ params }: PageProps<"/[locale]/privacy">) {
  const locale = await pageLocale(params);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Markdown source={await loadLegal("privacy", locale)} />
    </article>
  );
}

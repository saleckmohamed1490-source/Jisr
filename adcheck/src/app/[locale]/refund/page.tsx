import type { Metadata } from "next";
import { pageLocale } from "@/i18n/params";
import { isLocale, routing } from "@/i18n/routing";
import { legalTitle, loadLegal } from "@/lib/legal";
import { Markdown } from "@/components/Markdown";

export async function generateMetadata({ params }: PageProps<"/[locale]/refund">): Promise<Metadata> {
  const { locale } = await params;
  return { title: legalTitle(await loadLegal("refund", isLocale(locale) ? locale : routing.defaultLocale)) };
}

export default async function Page({ params }: PageProps<"/[locale]/refund">) {
  const locale = await pageLocale(params);
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Markdown source={await loadLegal("refund", locale)} />
    </article>
  );
}

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locale } from "@/i18n/routing";
import { APP_NAME, LEGAL_LAST_UPDATED, SUPPORT_EMAIL } from "@/lib/brand";
import { formatDate } from "@/lib/i18n/format";

export const LEGAL_DOCS = ["terms", "privacy", "refund"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

/** Reads content/legal/<locale>/<doc>.md and fills {app}, {email}, {date}. */
export async function loadLegal(doc: LegalDoc, locale: Locale): Promise<string> {
  const raw = await readFile(path.join(process.cwd(), "content", "legal", locale, `${doc}.md`), "utf8");
  return raw
    .replaceAll("{app}", APP_NAME)
    .replaceAll("{email}", SUPPORT_EMAIL)
    .replaceAll("{date}", formatDate(LEGAL_LAST_UPDATED, locale));
}

export function legalTitle(source: string): string {
  return source.match(/^# (.+)$/m)?.[1] ?? "";
}

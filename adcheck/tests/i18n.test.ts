import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { routing } from "@/i18n/routing";

type Json = { [k: string]: Json } | string | Json[];

function keys(obj: Json, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`, ...obj.flatMap((v, i) => keys(v, `${prefix}[${i}]`))];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const load = (l: string) => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as Json;

describe("translations", () => {
  const reference = keys(load(routing.defaultLocale)).sort();
  for (const locale of routing.locales) {
    it(`${locale} has exactly the same keys as ${routing.defaultLocale}`, () => {
      expect(keys(load(locale)).sort()).toEqual(reference);
    });
  }
});

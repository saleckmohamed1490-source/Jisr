import { z } from "zod";
import { isLocale, type Locale } from "@/lib/i18n/config";

export const AD_TEXT_MAX = 3000;
export const PRODUCT_MAX = 1000;

export const CheckFieldsSchema = z.object({
  adText: z.string().trim().min(1, "textRequired").max(AD_TEXT_MAX, "tooLong"),
  product: z.string().trim().min(1, "productRequired").max(PRODUCT_MAX, "tooLong"),
  landingUrl: z
    .string()
    .trim()
    .max(2000, "tooLong")
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^https?:\/\/[^\s]+$/i.test(v), "invalidUrl"),
});

export function parseLocale(value: unknown, fallback: Locale): Locale {
  return isLocale(value) ? value : fallback;
}

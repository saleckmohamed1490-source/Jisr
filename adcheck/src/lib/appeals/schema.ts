import { z } from "zod";

/** What the model returns for an appeal. Validated with zod on every response. */
export const AppealSchema = z.object({
  assessment: z
    .enum(["likely_mistaken", "unclear", "likely_justified"])
    .describe("Honest view of the rejection given the facts provided"),
  assessment_note: z.string().describe("1-2 sentences explaining the assessment, in the UI language"),
  subject: z.string().describe("Short subject line for the review request, in the letter language"),
  letter: z.string().describe("The full review request, ready to paste, in the letter language"),
  tips: z.array(z.string()).describe("3-5 practical tips on submitting the request, in the UI language"),
});
export type Appeal = z.infer<typeof AppealSchema>;

export const AppealInputSchema = z.object({
  rejectionReason: z.string().trim().min(10, "reasonRequired").max(4000, "tooLong"),
  adText: z.string().trim().max(3000, "tooLong").optional().default(""),
  product: z.string().trim().max(1000, "tooLong").optional().default(""),
  changesMade: z.string().trim().max(2000, "tooLong").optional().default(""),
  letterLanguage: z.enum(["en", "ar", "fr"]),
  checkId: z.uuid().optional(),
});
export type AppealInput = z.infer<typeof AppealInputSchema>;

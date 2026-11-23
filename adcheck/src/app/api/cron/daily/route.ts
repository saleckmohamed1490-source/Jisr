import { NextResponse, type NextRequest } from "next/server";
import { expireSubscriptions, renewDueCredits, sendRenewalReminders } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron, see vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expired = await expireSubscriptions();
  const renewed = await renewDueCredits();
  const reminders = await sendRenewalReminders();
  console.info("[cron] daily", { expired, renewed, reminders });
  return NextResponse.json({ ok: true, expired, renewed, reminders });
}

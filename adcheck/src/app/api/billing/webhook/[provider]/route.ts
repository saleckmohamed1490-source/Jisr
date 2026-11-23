import { NextResponse, type NextRequest } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { applyBillingEvent } from "@/lib/billing/service";
import { WebhookSignatureError } from "@/lib/billing/types";

export const runtime = "nodejs";

/** Webhook endpoint per provider, e.g. /api/billing/webhook/lemonsqueezy */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/billing/webhook/[provider]">) {
  const { provider: name } = await ctx.params;
  const provider = getBillingProvider(name);
  if (!provider) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const rawBody = await req.text(); // raw text is required for signature verification
  let events;
  try {
    events = await provider.parseWebhook(rawBody, req.headers);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error("[webhook] parse error", err);
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  try {
    for (const event of events) {
      const result = await applyBillingEvent(provider.name, event);
      console.info("[webhook]", provider.name, event.type, event.subscriptionId, result);
    }
  } catch (err) {
    console.error("[webhook] apply failed", err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // provider will retry
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { applyPaymentUpdate } from "@/lib/payments/service";
import { WebhookSignatureError } from "@/lib/payments/types";

export const runtime = "nodejs";

/**
 * Payment webhooks, one URL per provider: /api/webhooks/nowpayments (IPN).
 * Requests with a missing or wrong signature are rejected with 401.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider: name } = await ctx.params;
  const provider = getPaymentProvider(name);
  if (!provider) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const rawBody = await req.text(); // the exact body is needed for the signature
  let update;
  try {
    update = provider.parseWebhook(rawBody, req.headers);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn("[webhook] rejected:", err.message);
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    console.error("[webhook] bad payload", err);
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  try {
    const result = await applyPaymentUpdate(provider.name, update);
    console.info("[webhook]", provider.name, update.orderId, update.status, result);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[webhook] processing failed", err);
    // 5xx makes the provider retry later; activation is idempotent.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

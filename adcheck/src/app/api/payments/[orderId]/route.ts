import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Live status for the payment-status page. RLS: users only see their own payments. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/payments/[orderId]">) {
  const { orderId } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("order_id, status, plan, months, price_usd, pay_currency, pay_amount, actually_paid, payin_hash, invoice_url, period_end, activated_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

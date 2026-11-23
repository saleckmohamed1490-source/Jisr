"use server";

import { redirect as nextRedirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getUser } from "@/lib/supabase/server";
import { isDuration, isPaidPlan } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { CheckoutError, createCheckout } from "./service";

/** "Pay with crypto": create the invoice server-side, then send the user to it. */
export async function startCryptoCheckout(form: FormData) {
  const locale = await getLocale();
  const plan = form.get("plan");
  const months = Number(form.get("months"));
  const coin = String(form.get("coin") ?? "");
  const back = `/billing/checkout?plan=${plan}&months=${months}`;

  const user = await getUser();
  if (!user) return redirect({ href: `/login?next=${encodeURIComponent(back)}`, locale });
  if (!isPaidPlan(plan) || !isDuration(months)) return redirect({ href: "/pricing", locale });
  if (!(await rateLimit(user.id, "checkout"))) return redirect({ href: `${back}&error=rate`, locale });

  let invoiceUrl: string;
  try {
    invoiceUrl = await createCheckout({ userId: user.id, plan, months, coin, locale });
  } catch (err) {
    const code = err instanceof CheckoutError ? err.code : "provider";
    return redirect({ href: `${back}&error=${code}`, locale });
  }
  nextRedirect(invoiceUrl);
}

"use server";

import { redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import { getBillingProvider } from "./index";

export async function startCheckout() {
  const user = await getUser();
  if (!user) redirect("/login?next=/billing");
  const provider = getBillingProvider();
  if (!provider?.isConfigured()) redirect("/billing?error=not_configured");

  let url: string;
  try {
    url = await provider.createCheckout({
      userId: user.id,
      email: user.email ?? null,
      successUrl: `${await siteUrl()}/billing?success=1`,
    });
  } catch (err) {
    console.error("[billing] checkout failed", err);
    redirect("/billing?error=checkout");
  }
  redirect(url);
}

export async function openCustomerPortal() {
  const user = await getUser();
  if (!user) redirect("/login?next=/billing");
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id, manage_url")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ provider: string; provider_subscription_id: string; manage_url: string | null }>();
  if (!sub) redirect("/billing");

  const provider = getBillingProvider(sub.provider);
  const url = (await provider?.getManageUrl?.(sub.provider_subscription_id)) ?? sub.manage_url;
  redirect(url ?? "/billing");
}

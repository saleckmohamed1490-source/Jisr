import { getI18n } from "@/lib/i18n/server";
import { AuthForm } from "@/components/AuthForm";
import { safeNext } from "@/lib/site-url";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { t } = await getI18n();
  const sp = await searchParams;
  return <AuthForm mode="login" t={t} next={safeNext(sp.next)} oauthError={sp.error === "oauth"} />;
}

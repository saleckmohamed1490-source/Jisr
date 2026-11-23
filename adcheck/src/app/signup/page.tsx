import { getI18n } from "@/lib/i18n/server";
import { AuthForm } from "@/components/AuthForm";

export default async function SignupPage() {
  const { t } = await getI18n();
  return <AuthForm mode="signup" t={t} />;
}

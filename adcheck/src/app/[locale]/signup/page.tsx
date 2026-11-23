import { pageLocale } from "@/i18n/params";
import { AuthForm } from "@/components/AuthForm";

export default async function SignupPage({ params }: PageProps<"/[locale]/signup">) {
  await pageLocale(params);
  return <AuthForm mode="signup" />;
}

import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { getI18n } from "@/lib/i18n/server";
import { dirOf } from "@/lib/i18n/config";
import { Header } from "@/components/Header";
import { getUser } from "@/lib/supabase/server";
import "./globals.css";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.title, description: t.meta.description };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();
  const user = process.env.NEXT_PUBLIC_SUPABASE_URL ? await getUser() : null;
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${latin.variable} ${arabic.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header locale={locale} t={t} signedIn={!!user} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <p>{t.common.disclaimer}</p>
          <p className="mt-1">© {new Date().getFullYear()} {t.common.appName}</p>
        </footer>
      </body>
    </html>
  );
}

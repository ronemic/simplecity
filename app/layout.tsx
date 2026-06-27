import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "SimpleCity",
  description: "Local decisions, translated into plain-English civic action cards.",
  icons: {
    icon: "/favicon.svg"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body className="font-sans antialiased">
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=G-SQRVDWEMHW`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-SQRVDWEMHW');
          `}
        </Script>
        <Header />
        <main>{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}

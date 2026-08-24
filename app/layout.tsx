import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SupportCallout } from "@/components/SupportCallout";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { getRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  metadataBase: new URL(getConfiguredAppUrl()),
  applicationName: "SimpleCity",
  title: "SimpleCity",
  description: "Easy-to-understand, source-linked summaries of local decisions, upcoming votes, and outcomes.",
  openGraph: {
    title: "SimpleCity",
    description: "Easy-to-understand, source-linked summaries of local decisions, upcoming votes, and outcomes.",
    type: "website",
    siteName: "SimpleCity"
  },
  twitter: {
    card: "summary",
    title: "SimpleCity",
    description: "Easy-to-understand, source-linked summaries of local decisions, upcoming votes, and outcomes."
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "SimpleCity",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#2457a6"
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
        {/* Holds a viewport's worth of height so the support callout and
            footer below stay off-screen while a route's loading skeleton is
            showing. Without it they paint high on the page and then jump
            down when the streamed content arrives, which is layout shift. */}
        <main className="min-h-[calc(100vh-3rem)]">{children}</main>
        <SupportCallout locale={locale} />
        <Footer locale={locale} />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

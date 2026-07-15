import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { getRequestLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  metadataBase: new URL(getConfiguredAppUrl()),
  applicationName: "SimpleCity",
  title: "SimpleCity",
  description: "Local decisions, translated into plain-English civic action cards.",
  openGraph: {
    title: "SimpleCity",
    description: "Local decisions, translated into plain-English civic action cards.",
    type: "website",
    siteName: "SimpleCity"
  },
  twitter: {
    card: "summary",
    title: "SimpleCity",
    description: "Local decisions, translated into plain-English civic action cards."
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
        <main>{children}</main>
        <Footer locale={locale} />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

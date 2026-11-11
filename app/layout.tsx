import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./local-redesign.css";
import "maplibre-gl/dist/maplibre-gl.css";
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
      {/* Extensions such as Grammarly add body attributes before hydration. */}
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

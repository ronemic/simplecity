import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./local-redesign.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { getConfiguredAppUrl } from "@/lib/appUrl";
import { getRequestLocale } from "@/lib/i18n/server";

const SITE_DESCRIPTION = {
  en: "Easy-to-understand, source-linked summaries of local decisions, upcoming votes, and outcomes.",
  es: "Resúmenes claros y con enlaces a las fuentes de decisiones locales, próximas votaciones y resultados."
};

// Pages that set no description of their own inherit this one, so it follows
// the reader's language.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const description = SITE_DESCRIPTION[locale];

  return {
    metadataBase: new URL(getConfiguredAppUrl()),
    applicationName: "SimpleCity",
    title: "SimpleCity",
    description,
    openGraph: {
      title: "SimpleCity",
      description,
      type: "website",
      siteName: "SimpleCity",
      locale: locale === "es" ? "es_US" : "en_US"
    },
    twitter: {
      card: "summary",
      title: "SimpleCity",
      description
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
}

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

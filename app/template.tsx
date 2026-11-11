import Script from "next/script";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SupportCallout } from "@/components/SupportCallout";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SiteNavigationProvider } from "@/components/SiteNavigation";
import { PreviewHeader } from "@/components/local-redesign/PreviewHeader";
import { PreviewFooter } from "@/components/local-redesign/PreviewPages";
import { getRequestLocale } from "@/lib/i18n/server";
import { isBetaRequest } from "@/lib/localRedesign";

export default async function SiteTemplate({ children }: { children: React.ReactNode }) {
  const [locale, beta] = await Promise.all([getRequestLocale(), isBetaRequest()]);
  if (beta) {
    return (
      <SiteNavigationProvider beta>
        <div className="local-redesign antialiased">
          <PreviewHeader locale={locale} />
          <main>{children}</main>
          <PreviewFooter locale={locale} />
        </div>
      </SiteNavigationProvider>
    );
  }

  return (
    <SiteNavigationProvider beta={false}>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-SQRVDWEMHW" strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-SQRVDWEMHW');`}
      </Script>
      <Header />
      {/* Reserve space for streamed content so the footer stays below the fold. */}
      <main className="min-h-[calc(100vh-3rem)]">{children}</main>
      <SupportCallout locale={locale} />
      <Footer locale={locale} />
      <ServiceWorkerRegistration />
    </SiteNavigationProvider>
  );
}

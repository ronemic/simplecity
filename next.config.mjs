import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildContentSecurityPolicy(environment = process.env.NODE_ENV) {
  const development = environment === "development";
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    ...(development ? ["'unsafe-eval'"] : []),
    "https://www.googletagmanager.com"
  ];
  const connectSources = [
    "'self'",
    ...(development ? ["ws:", "wss:"] : []),
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.supabase.co"
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://*.swagit.com https://*.granicus.com https://*.legistar.com https://*.iqm2.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    ...(development ? [] : ["upgrade-insecure-requests"])
  ].join("; ");
}

const contentSecurityPolicy = buildContentSecurityPolicy();

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains"
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

import { createHmac, timingSafeEqual } from "node:crypto";

const SCRAPE_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

function signaturePayload(timestamp: string, requestUrl: string, method: string) {
  const url = new URL(requestUrl);
  return `${timestamp}\n${method.toUpperCase()}\n${url.pathname}${url.search}`;
}

export function createScrapeRequestSignature(
  secret: string,
  timestamp: string,
  requestUrl: string,
  method = "POST"
) {
  return createHmac("sha256", secret)
    .update(signaturePayload(timestamp, requestUrl, method))
    .digest("hex");
}

export function isValidScrapeRequestSignature({
  secret,
  timestamp,
  signature,
  requestUrl,
  method = "POST",
  nowSeconds = Math.floor(Date.now() / 1000)
}: {
  secret: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  requestUrl: string;
  method?: string;
  nowSeconds?: number;
}) {
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;

  const requestedAt = Number(timestamp);
  if (
    !Number.isSafeInteger(requestedAt) ||
    Math.abs(nowSeconds - requestedAt) > SCRAPE_SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const expected = createScrapeRequestSignature(secret, timestamp, requestUrl, method);
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

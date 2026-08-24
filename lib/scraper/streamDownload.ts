import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { BrowserContext } from "playwright";

export const STREAM_DOWNLOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;
export const STREAM_DOWNLOAD_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
export const STREAM_DOWNLOAD_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;
export const STREAM_DOWNLOAD_HEADER_TIMEOUT_MS = 60_000;
export const STREAM_DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;
export const STREAM_DOWNLOAD_TOTAL_TIMEOUT_MS = 10 * 60_000;
export const STREAM_DOWNLOAD_MAX_REDIRECTS = 5;
export const STREAM_DOWNLOAD_PREFIX_BYTES = 4096;

export type StreamDownloadBudget = {
  maxBytes: number;
  usedBytes: number;
};

type CookieContext = Pick<BrowserContext, "addCookies" | "clearCookies" | "cookies">;

type StatFsResult = {
  bavail: number | bigint;
  bsize: number | bigint;
};

export type StreamDownloadOptions = {
  headers?: Record<string, string>;
  validateUrl?: (url: string) => boolean;
  shouldStop?: () => boolean;
  budget?: StreamDownloadBudget;
  maxFileBytes?: number;
  minFreeBytes?: number;
  headerTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxRedirects?: number;
  prefixBytes?: number;
  fetchImpl?: typeof fetch;
  statfsImpl?: (directory: string) => Promise<StatFsResult>;
};

export type StreamedDownload = {
  tempPath: string;
  finalUrl: string;
  headers: Headers;
  bytes: number;
  prefix: Buffer;
  commit(finalPath: string): Promise<void>;
  cleanup(): Promise<void>;
};

export function createStreamDownloadBudget(
  maxBytes = STREAM_DOWNLOAD_MAX_TOTAL_BYTES
): StreamDownloadBudget {
  return {
    maxBytes: Math.min(
      positiveLimit(maxBytes, STREAM_DOWNLOAD_MAX_TOTAL_BYTES),
      STREAM_DOWNLOAD_MAX_TOTAL_BYTES
    ),
    usedBytes: 0
  };
}

function positiveLimit(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function assertDownloadUrl(url: string, validateUrl?: (url: string) => boolean) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported document URL protocol: ${parsed.protocol}`);
  }
  if (validateUrl && !validateUrl(parsed.toString())) {
    throw new Error(`Redirected to a disallowed URL: ${parsed.toString()}`);
  }
  return parsed.toString();
}

function defaultCookiePath(url: URL) {
  const pathname = url.pathname || "/";
  if (!pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

type ParsedResponseCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  expired: boolean;
};

function parseResponseCookie(line: string, responseUrl: string): ParsedResponseCookie | null {
  const url = new URL(responseUrl);
  const [pair, ...attributeParts] = line.split(";");
  const equals = pair.indexOf("=");
  if (equals <= 0) return null;

  const name = pair.slice(0, equals).trim();
  const value = pair.slice(equals + 1).trim();
  if (!name) return null;

  let domain = url.hostname.toLowerCase();
  let cookiePath = defaultCookiePath(url);
  let expires: number | undefined;
  let maxAge: number | undefined;
  let httpOnly = false;
  let secure = false;
  let sameSite: ParsedResponseCookie["sameSite"];

  for (const rawAttribute of attributeParts) {
    const separator = rawAttribute.indexOf("=");
    const rawName = separator >= 0 ? rawAttribute.slice(0, separator) : rawAttribute;
    const rawValue = separator >= 0 ? rawAttribute.slice(separator + 1).trim() : "";
    const attribute = rawName.trim().toLowerCase();

    if (attribute === "domain" && rawValue) {
      const normalizedDomain = rawValue.toLowerCase();
      const bareDomain = normalizedDomain.replace(/^\./, "");
      if (url.hostname !== bareDomain && !url.hostname.endsWith(`.${bareDomain}`)) {
        return null;
      }
      domain = normalizedDomain;
    } else if (attribute === "path" && rawValue.startsWith("/")) {
      cookiePath = rawValue;
    } else if (attribute === "expires" && rawValue) {
      const parsed = Date.parse(rawValue);
      if (Number.isFinite(parsed)) expires = Math.floor(parsed / 1000);
    } else if (attribute === "max-age" && rawValue) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) maxAge = parsed;
    } else if (attribute === "httponly") {
      httpOnly = true;
    } else if (attribute === "secure") {
      secure = true;
    } else if (attribute === "samesite") {
      const normalized = rawValue.toLowerCase();
      if (normalized === "strict") sameSite = "Strict";
      if (normalized === "lax") sameSite = "Lax";
      if (normalized === "none") sameSite = "None";
    }
  }

  if (maxAge !== undefined) {
    expires = Math.floor(Date.now() / 1000 + maxAge);
  }

  return {
    name,
    value,
    domain,
    path: cookiePath,
    ...(expires !== undefined ? { expires } : {}),
    ...(httpOnly ? { httpOnly: true } : {}),
    ...(secure ? { secure: true } : {}),
    ...(sameSite ? { sameSite } : {}),
    expired: maxAge !== undefined ? maxAge <= 0 : expires !== undefined && expires <= Date.now() / 1000
  };
}

async function applyResponseCookies(
  context: CookieContext | null,
  headers: Headers,
  responseUrl: string
) {
  if (!context) return;
  if (typeof headers.getSetCookie !== "function") return;

  for (const line of headers.getSetCookie()) {
    const parsed = parseResponseCookie(line, responseUrl);
    if (!parsed) continue;

    try {
      if (parsed.expired) {
        await context.clearCookies({
          name: parsed.name,
          domain: parsed.domain,
          path: parsed.path
        });
        continue;
      }

      await context.addCookies([{
        name: parsed.name,
        value: parsed.value,
        domain: parsed.domain,
        path: parsed.path,
        ...(parsed.expires !== undefined ? { expires: parsed.expires } : {}),
        ...(parsed.httpOnly ? { httpOnly: true } : {}),
        ...(parsed.secure ? { secure: true } : {}),
        ...(parsed.sameSite ? { sameSite: parsed.sameSite } : {})
      }]);
    } catch {
      // Browsers ignore malformed or disallowed Set-Cookie values; match that behavior.
    }
  }
}

async function cookieHeader(context: CookieContext | null, url: string) {
  if (!context) return "";
  const now = Date.now() / 1000;
  const cookies = await context.cookies(url);
  return cookies
    .filter((cookie) => cookie.expires < 0 || cookie.expires > now)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function cancelBody(response?: Response | null) {
  try {
    await response?.body?.cancel();
  } catch {
    // The body may already be closed by an abort or redirect.
  }
}

function contentLength(headers: Headers) {
  const parsed = Number(headers.get("content-length") || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function freeBytes(
  directory: string,
  statfsImpl: (directory: string) => Promise<StatFsResult>
) {
  try {
    const stats = await statfsImpl(directory);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return Number.isFinite(available) && available >= 0 ? available : null;
  } catch {
    return null;
  }
}

function errorFromUnknown(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback);
}

export async function streamDownloadToTemp(
  context: CookieContext | null,
  url: string,
  targetPath: string,
  options: StreamDownloadOptions = {}
): Promise<StreamedDownload> {
  const fetchImpl = options.fetchImpl || fetch;
  const statfsImpl = options.statfsImpl || fs.statfs;
  const budget = options.budget || createStreamDownloadBudget();
  const maxFileBytes = Math.min(
    positiveLimit(options.maxFileBytes, STREAM_DOWNLOAD_MAX_FILE_BYTES),
    STREAM_DOWNLOAD_MAX_FILE_BYTES
  );
  const minFreeBytes = Number.isFinite(options.minFreeBytes)
    ? Math.max(0, Number(options.minFreeBytes))
    : STREAM_DOWNLOAD_MIN_FREE_BYTES;
  const headerTimeoutMs = Math.min(
    positiveLimit(options.headerTimeoutMs, STREAM_DOWNLOAD_HEADER_TIMEOUT_MS),
    STREAM_DOWNLOAD_HEADER_TIMEOUT_MS
  );
  const idleTimeoutMs = Math.min(
    positiveLimit(options.idleTimeoutMs, STREAM_DOWNLOAD_IDLE_TIMEOUT_MS),
    STREAM_DOWNLOAD_IDLE_TIMEOUT_MS
  );
  const totalTimeoutMs = Math.min(
    positiveLimit(options.totalTimeoutMs, STREAM_DOWNLOAD_TOTAL_TIMEOUT_MS),
    STREAM_DOWNLOAD_TOTAL_TIMEOUT_MS
  );
  const requestedMaxRedirects = Number.isFinite(options.maxRedirects)
    ? Number(options.maxRedirects)
    : STREAM_DOWNLOAD_MAX_REDIRECTS;
  const maxRedirects = Math.max(
    0,
    Math.min(
      Math.floor(requestedMaxRedirects),
      STREAM_DOWNLOAD_MAX_REDIRECTS
    )
  );
  const prefixLimit = Math.min(
    Math.max(
      5,
      Math.floor(positiveLimit(options.prefixBytes, STREAM_DOWNLOAD_PREFIX_BYTES))
    ),
    STREAM_DOWNLOAD_PREFIX_BYTES
  );
  const tempPath = `${targetPath}.${randomUUID()}.part`;
  const controller = new AbortController();
  let abortReason: Error | null = null;
  let response: Response | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let committed = false;

  const abort = (reason: Error) => {
    if (!abortReason) abortReason = reason;
    if (!controller.signal.aborted) controller.abort(reason);
  };
  const totalTimer = setTimeout(
    () => abort(new Error(`Document transfer timed out after ${totalTimeoutMs}ms.`)),
    totalTimeoutMs
  );
  const stopPoll = options.shouldStop
    ? setInterval(() => {
        if (options.shouldStop?.()) {
          abort(new Error("Document transfer stopped because the pipeline deadline is near."));
        }
      }, 1000)
    : null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => abort(new Error(`Document transfer made no progress for ${idleTimeoutMs}ms.`)),
      idleTimeoutMs
    );
  };

  try {
    if (options.shouldStop?.()) {
      throw new Error("Document transfer stopped because the pipeline deadline is near.");
    }
    if (!Number.isFinite(budget.usedBytes) || budget.usedBytes < 0) {
      throw new Error("Document download budget had an invalid used-byte count.");
    }

    // Complete every asynchronous safety precheck before opening the response.
    // Undici can pause an unread response body under backpressure; if the peer
    // closes the socket while we await unrelated work, affected Node versions
    // throw an uncatchable Parser.finish assertion instead of rejecting fetch.
    const absoluteBudgetBytes = Math.min(
      positiveLimit(budget.maxBytes, STREAM_DOWNLOAD_MAX_TOTAL_BYTES),
      STREAM_DOWNLOAD_MAX_TOTAL_BYTES
    );
    const remainingBudget = Math.max(0, absoluteBudgetBytes - budget.usedBytes);
    if (remainingBudget <= 0) {
      throw new Error(
        `Document download stopped at the ${absoluteBudgetBytes}-byte invocation safety limit.`
      );
    }
    const available = await freeBytes(path.dirname(targetPath), statfsImpl);
    if (available === null && minFreeBytes > 0) {
      throw new Error("Document download could not verify the configured free-disk reserve.");
    }
    const writableFreeBytes = available === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, available - minFreeBytes);
    const effectiveMaxBytes = Math.min(maxFileBytes, remainingBudget, writableFreeBytes);
    if (effectiveMaxBytes <= 0) {
      throw new Error("Document download stopped to preserve the configured disk reserve.");
    }

    let requestUrl = assertDownloadUrl(url, options.validateUrl);
    const initialOrigin = new URL(requestUrl).origin;
    for (let redirectCount = 0; ; redirectCount += 1) {
      requestUrl = assertDownloadUrl(requestUrl, options.validateUrl);
      const requestHeaders = new Headers(options.headers);
      if (new URL(requestUrl).origin !== initialOrigin) {
        requestHeaders.delete("Authorization");
        requestHeaders.delete("Cookie");
        requestHeaders.delete("Proxy-Authorization");
      }
      if (!requestHeaders.has("accept-encoding")) requestHeaders.set("Accept-Encoding", "identity");
      const cookies = await cookieHeader(context, requestUrl);
      if (cookies) requestHeaders.set("Cookie", cookies);

      const headerTimer = setTimeout(
        () => abort(new Error(`Document response headers timed out after ${headerTimeoutMs}ms.`)),
        headerTimeoutMs
      );
      try {
        response = await fetchImpl(requestUrl, {
          method: "GET",
          headers: requestHeaders,
          redirect: "manual",
          signal: controller.signal
        });
      } catch (error) {
        throw abortReason || errorFromUnknown(error, "Document request failed.");
      } finally {
        clearTimeout(headerTimer);
      }

      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const location = response.headers.get("location");
      await cancelBody(response);
      await applyResponseCookies(context, response.headers, requestUrl);
      if (!location) throw new Error(`HTTP ${response.status} redirect had no Location header.`);
      if (redirectCount >= maxRedirects) {
        throw new Error(`Document exceeded the ${maxRedirects}-redirect limit.`);
      }
      requestUrl = new URL(location, requestUrl).toString();
      response = null;
    }

    if (!response.ok) {
      await cancelBody(response);
      await applyResponseCookies(context, response.headers, requestUrl);
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.body) {
      await applyResponseCookies(context, response.headers, requestUrl);
      throw new Error("Document response had no body.");
    }

    const declaredBytes = contentLength(response.headers);
    if (declaredBytes !== null && declaredBytes > effectiveMaxBytes) {
      await cancelBody(response);
      await applyResponseCookies(context, response.headers, requestUrl);
      throw new Error(
        `Document declared ${declaredBytes} bytes, above the ${effectiveMaxBytes}-byte absolute safety limit.`
      );
    }

    let bytes = 0;
    let prefixLength = 0;
    const prefixChunks: Buffer[] = [];
    resetIdleTimer();
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        try {
          if (options.shouldStop?.()) {
            throw new Error("Document transfer stopped because the pipeline deadline is near.");
          }
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          budget.usedBytes += buffer.length;
          if (bytes > effectiveMaxBytes) {
            throw new Error(
              `Document exceeded the ${effectiveMaxBytes}-byte absolute safety limit while streaming.`
            );
          }

          if (prefixLength < prefixLimit) {
            const slice = buffer.subarray(0, prefixLimit - prefixLength);
            prefixChunks.push(Buffer.from(slice));
            prefixLength += slice.length;
          }
          resetIdleTimer();
          callback(null, buffer);
        } catch (error) {
          const streamError = errorFromUnknown(error, "Document stream failed.");
          abort(streamError);
          callback(streamError);
        }
      }
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
        counter,
        createWriteStream(tempPath, { flags: "wx" }),
        { signal: controller.signal }
      );
    } catch (error) {
      throw abortReason || errorFromUnknown(error, "Document stream failed.");
    }

    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    // Preserve browser-session cookies only after the body is fully drained so
    // cookie synchronization cannot leave Undici paused when the peer sends FIN.
    await applyResponseCookies(context, response.headers, requestUrl);
    const finalUrl = response.url || requestUrl;
    const responseHeaders = response.headers;

    return {
      tempPath,
      finalUrl,
      headers: responseHeaders,
      bytes,
      prefix: Buffer.concat(prefixChunks, prefixLength),
      async commit(finalPath: string) {
        if (path.dirname(finalPath) !== path.dirname(tempPath)) {
          throw new Error("Streamed documents must be committed within their temporary directory.");
        }
        await fs.rename(tempPath, finalPath);
        committed = true;
      },
      async cleanup() {
        if (!committed) await fs.rm(tempPath, { force: true });
      }
    };
  } catch (error) {
    await cancelBody(response);
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw abortReason || error;
  } finally {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (stopPoll) clearInterval(stopPoll);
  }
}

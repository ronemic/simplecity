import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export async function fetchEscribeDocument(url: string, init?: RequestInit): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:" || !target.hostname.endsWith(".escribemeetings.com") ||
    target.pathname.toLowerCase() !== "/filestream.ashx") {
    throw new Error("Only official eSCRIBE HTTPS document URLs are supported");
  }
  init?.signal?.throwIfAborted();
  const { stdout } = await runFile(process.env.ESCRIBE_PYTHON || "python3", [
    path.join(process.cwd(), "scripts", "escribe_fetch.py"), target.toString()
  ], { encoding: "buffer", maxBuffer: 25 * 1024 * 1024 + 4096, timeout: 60_000,
    signal: init?.signal || undefined });
  const newline = stdout.indexOf(10);
  if (newline < 0) throw new Error("eSCRIBE document fetch returned no response metadata");
  const metadata = JSON.parse(stdout.subarray(0, newline).toString("utf8"));
  return new Response(stdout.subarray(newline + 1), metadata);
}

export function withEscribeDocumentFallback(
  browserFetch: typeof fetch,
  log: (message: string) => void,
  fallback: typeof fetchEscribeDocument = fetchEscribeDocument
): typeof fetch {
  return async (input, init) => {
    try {
      return await browserFetch(input, init);
    } catch (error) {
      if (init?.signal?.aborted || !(error instanceof Error) || !/Cloudflare browser challenge/.test(error.message)) throw error;
      // A fresh challenge navigation can finish establishing the session after
      // the first page timed out. Retry the same document before changing
      // transports so the first agenda is not lost while later ones succeed.
      log("Browser challenge timed out; retrying the document in a fresh challenge page.");
      try {
        return await browserFetch(input, init);
      } catch (retryError) {
        if (init?.signal?.aborted || !(retryError instanceof Error) || !/Cloudflare browser challenge/.test(retryError.message)) throw retryError;
      }
      const url = input instanceof Request ? input.url : String(input);
      log("Browser challenge unresolved; retrying the official eSCRIBE document with the browser TLS client.");
      return fallback(url, init);
    }
  };
}

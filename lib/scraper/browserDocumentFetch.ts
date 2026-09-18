import type { Page } from "playwright";

/**
 * Keep public document requests in the portal's browser session. Some eSCRIBE
 * hosts challenge Node HTTP clients even when they receive the browser cookies.
 * Pull one bounded chunk at a time so streamDownloadToTemp still enforces its
 * disk, byte, deadline and idle limits without buffering a PDF in Node memory.
 */
export function createBrowserDocumentFetch(page: Page, portalUrl: string): typeof fetch {
  const origin = new URL(portalUrl).origin;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin || new URL(page.url()).origin !== origin) {
      throw new Error("Browser document download must stay on the official portal origin.");
    }
    if ((init?.method || "GET") !== "GET") {
      throw new Error("Browser document download only supports GET.");
    }
    const signal = init?.signal;
    signal?.throwIfAborted();
    const controller = await page.evaluateHandle(() => new AbortController());
    const abort = () => {
      void controller.evaluate((value) => value.abort()).catch(() => undefined);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const headers = new Headers(init?.headers);
    // Chromium owns cookies, User-Agent and the other forbidden fetch headers.
    // Reject redirects because browser fetch cannot expose their Location for
    // the streaming caller to validate before following them.
    let response;
    try {
      response = await page.evaluateHandle(async ({ url, accept, controller }) => {
        const result = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { Accept: accept },
          signal: controller.signal
        });
        return {
          status: result.status,
          headers: Array.from(result.headers.entries()),
          reader: result.body?.getReader(),
          pending: new Uint8Array(0)
        };
      }, { url: url.toString(), accept: headers.get("accept") || "*/*", controller });
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      await controller.dispose();
      throw signal?.aborted ? signal.reason : error;
    }

    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      signal?.removeEventListener("abort", abort);
      await controller.evaluate((value) => value.abort()).catch(() => undefined);
      await Promise.all([response.dispose(), controller.dispose()]);
    };
    try {
      const metadata = await response.evaluate(({ status, headers }) => ({ status, headers }));
      if ([204, 205, 304].includes(metadata.status)) {
        await cleanup();
        return new Response(null, metadata);
      }
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            signal?.throwIfAborted();
            const chunk = await response.evaluate(async (state) => {
              if (!state.pending.byteLength) {
                const next = await state.reader?.read();
                if (!next || next.done) return null;
                state.pending = next.value;
              }
              const bytes = state.pending.subarray(0, 64 * 1024);
              state.pending = state.pending.subarray(bytes.byteLength);
              let binary = "";
              for (const byte of bytes) binary += String.fromCharCode(byte);
              return btoa(binary);
            });
            if (chunk === null) {
              stream.close();
              await cleanup();
            } else {
              stream.enqueue(Buffer.from(chunk, "base64"));
            }
          } catch (error) {
            stream.error(signal?.aborted ? signal.reason : error);
            await cleanup();
          }
        },
        cancel: cleanup
      }, { highWaterMark: 0 });
      return new Response(body, metadata);
    } catch (error) {
      await cleanup();
      throw error;
    }
  };
}

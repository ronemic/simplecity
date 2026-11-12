/** Waits before the second, third and fourth attempts, as multiples of retryDelayMs. */
const RETRY_DELAY_MULTIPLIERS = [1, 10, 30];

/**
 * Load a portal's first page, retrying transient failures.
 *
 * One retry after a second was not enough: a DNS blip on a county's Legistar
 * host outlasted it and cost that jurisdiction a full day. Three retries spread
 * over about 40 seconds ride out that kind of outage, while a portal that is
 * really down still fails the run within a few minutes.
 */
export async function retryInitialNavigation<T>(
  load: () => Promise<T>,
  options: {
    label: string;
    log?: (message: string) => void;
    retryDelayMs?: number;
  }
) {
  const baseDelayMs = Math.max(0, options.retryDelayMs ?? 1_000);
  const maxAttempts = RETRY_DELAY_MULTIPLIERS.length + 1;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      const delayMs = baseDelayMs * RETRY_DELAY_MULTIPLIERS[attempt - 1];
      options.log?.(
        `${options.label} did not load (attempt ${attempt} of ${maxAttempts}); retrying in ${Math.round(delayMs / 1000)}s.`
      );
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

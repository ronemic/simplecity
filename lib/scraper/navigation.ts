export async function retryInitialNavigation<T>(
  load: () => Promise<T>,
  options: {
    label: string;
    log?: (message: string) => void;
    retryDelayMs?: number;
  }
) {
  try {
    return await load();
  } catch {
    options.log?.(`${options.label} did not load on the first attempt; retrying once.`);
    const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_000);
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    return load();
  }
}

/**
 * An in-memory value that is reused until a cheap version check says its source
 * changed.
 *
 * Built for decision search, which used to re-download every published card for
 * every new search term. The value is loaded once and then kept; at most once
 * per `checkIntervalMs` a small "version" query decides whether to keep it or
 * rebuild it. Readers therefore see data no staler than the check interval,
 * the same bound the page cache already gives them.
 */
type Entry<T> = {
  value: T;
  version: string | null;
  builtAt: number;
  checkedAt: number;
};

export type VersionedSource<T> = {
  /** A short string that changes whenever the loaded value would. */
  version: () => Promise<string>;
  load: () => Promise<T>;
};

export type VersionedCacheOptions = {
  checkIntervalMs: number;
  /** Rebuild in the background once a value is this old, even if its version matches. */
  maxAgeMs: number;
  now?: () => number;
  log?: (message: string) => void;
};

export class VersionedCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly builds = new Map<string, Promise<Entry<T>>>();
  private readonly checks = new Map<string, Promise<T>>();

  constructor(private readonly options: VersionedCacheOptions) {}

  private now() {
    return this.options.now ? this.options.now() : Date.now();
  }

  async get(key: string, source: VersionedSource<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (!entry) return (await this.build(key, source)).value;

    if (this.now() - entry.checkedAt < this.options.checkIntervalMs) {
      this.refreshInBackgroundIfOld(key, entry, source);
      return entry.value;
    }

    // Concurrent readers share one version check (and one rebuild, if needed).
    let check = this.checks.get(key);
    if (!check) {
      check = this.revalidate(key, entry, source).finally(() => this.checks.delete(key));
      this.checks.set(key, check);
    }
    return check;
  }

  private async revalidate(key: string, entry: Entry<T>, source: VersionedSource<T>) {
    let version: string | null = null;
    try {
      version = await source.version();
    } catch {
      // An unreadable version is treated as a change; the rebuild below decides.
    }

    if (version !== null && version === entry.version) {
      entry.checkedAt = this.now();
      this.refreshInBackgroundIfOld(key, entry, source);
      return entry.value;
    }

    try {
      return (await this.build(key, source)).value;
    } catch (error) {
      // The source is failing right now. Keep serving what we have and wait a
      // full interval before trying again, rather than failing every reader.
      entry.checkedAt = this.now();
      this.options.log?.(
        `Kept the previous ${key} value because a rebuild failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      return entry.value;
    }
  }

  private refreshInBackgroundIfOld(key: string, entry: Entry<T>, source: VersionedSource<T>) {
    if (this.now() - entry.builtAt < this.options.maxAgeMs || this.builds.has(key)) return;
    this.build(key, source).catch((error) => {
      this.options.log?.(
        `Background refresh of ${key} failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
    });
  }

  private build(key: string, source: VersionedSource<T>) {
    const inFlight = this.builds.get(key);
    if (inFlight) return inFlight;

    const build = (async () => {
      // Read the version first. If the source changes while loading, the stored
      // version is the older one and the next check rebuilds, never the reverse.
      let version: string | null = null;
      try {
        version = await source.version();
      } catch {
        // No version means the next check cannot match and will rebuild.
      }
      const value = await source.load();
      const now = this.now();
      const entry = { value, version, builtAt: now, checkedAt: now };
      this.entries.set(key, entry);
      return entry;
    })().finally(() => this.builds.delete(key));

    this.builds.set(key, build);
    return build;
  }
}

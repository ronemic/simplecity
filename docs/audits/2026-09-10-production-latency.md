# Production latency audit — September 10, 2026

Audited https://simplecity.app with sequential, read-only HTTP requests and a headless Chromium browser. Implemented and verified changes locally; **these changes have not been deployed**.

## Production observations

These are individual samples from this machine, not percentiles or a load test. Cache state was not controlled. HTTP total includes completion of streamed HTML; an early first byte does not mean the decisions are ready.

| Route | First byte | Complete response |
| --- | ---: | ---: |
| `/` | 0.071 s | 0.216 s |
| `/decisions?jurisdiction=all` | 0.667 s | 2.771 s |
| `/meetings` | 0.853 s | 0.998 s |
| `/decisions?jurisdiction=los-altos` | 0.043 s | 0.247 s |
| `/about` | 0.213 s | 0.234 s |
| `/decisions?jurisdiction=all&q=park` | 0.279 s | 15.141 s |
| `/decisions?jurisdiction=all&result=approved` | 0.060 s | 15.234 s |
| `/decisions?jurisdiction=all&page=2` | 0.040 s | 1.379 s |
| `/decisions?jurisdiction=all&lang=es` | 0.149 s | 1.924 s |

A subsequent Chromium pass measured first contentful paint at 1.352 s for the homepage, 0.164 s for aggregate decisions, 0.620 s for meetings, and 0.332 s for Los Altos decisions. That pass followed the HTTP requests and benefited from warmed caches. The variation points to expensive data reads/cache misses; these measurements alone do not establish a production cold-start or database-region diagnosis.

## Changes

- Paginated decisions now choose the displayed cards before fetching outcomes and translations. Enrichment is batched by database, preserving page ordering and keeping different projects' rows separate.
- Search applies the existing rendered-text matching rules before fetching outcomes. Ordinary searches enrich only the displayed page. Result filters still load outcomes before deciding membership and computing counts.
- Freshness queries use the selected jurisdiction rather than contacting every jurisdiction on every single-city cache miss. Selection is part of the cache key.
- Existing five-minute public-content cache lifetime and invalidation tag remain in place. No database schema changes are required.

## Controlled query comparison

Executed the original `HEAD` query module and updated module from the same machine against the configured databases. Next's persistent cache was bypassed for both; recorded outgoing fetch counts. Original ran first, so connection/database warming can favor the updated timing. Request-count reductions are deterministic; timing samples are illustrative and are **not production speedup claims**.

| Query | Requests before → after | Duration before → after | Result |
| --- | ---: | ---: | --- |
| All jurisdictions, page 2 | 26 → 14 | 1,360 → 272 ms | Identical full response; 9,057 total, 12 displayed |
| All jurisdictions, search `park` | 81 → 16 | 1,344 → 622 ms | Identical full response; 452 total, 12 displayed |
| All jurisdictions, Spanish page 1 | 54 → 19 | 241 → 191 ms | Identical full response; 9,057 total, 12 displayed |
| All jurisdictions, approved results | 81 → 81 | 616 → 671 ms | Identical full response; 1,219 total, 12 displayed |
| Los Altos freshness | 13 → 1 | 54 → 48 ms | Only selected jurisdiction is queried |

Local production-build HTTP completion times were 1.482 s for aggregate decisions, 0.802 s for search `park`, 0.208 s for Los Altos, and 0.846 s for Spanish. These include real database reads but not the production hosting/network environment.

## Validation

- 694 tests passed, including new functional query tests for bounded enrichment, pagination order/counts, search results/outcomes, result filtering, and jurisdiction-scoped freshness.
- ESLint and TypeScript checks passed.
- Next.js production build passed. It reports an existing broad file-tracing warning through `next.config.mjs → lib/sources/legistar.ts → lib/pipeline.ts → app/api/scrape/route.ts`.
- Original and updated query responses compared identically for the four decision-query cases above, including Spanish content and outcomes.

## Remaining work

- Outcome-only filtering still fetches and enriches the full collection. Search also still reads base cards and, for Spanish, translations before filtering. Moving these paths to indexed, database-side pagination needs equivalent rendered-title/text normalization, locale fallback, and awaiting-result semantics across all configured databases. Naive SQL substring matching would change results.
- Deep aggregate pages still fetch up to `page × pageSize` candidates per jurisdiction; this patch bounds enrichment, not candidate reads.
- Re-measure the deployed version, including cache misses and repeated warm requests, before attributing a production improvement. Hosting cold starts, regional database latency, and resource contention were not measured through provider telemetry.

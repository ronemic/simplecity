export const PUBLIC_CACHE_REVALIDATE_SECONDS = 300;
export const PUBLIC_CONTENT_CACHE_TAG = "simplecity-public-content";

/**
 * The "at a glance" figures on the homepage are rendered rounded down to a whole
 * hundred with a "+" appended, so no digit on the page can change between one
 * five-minute window and the next. They were costing 39 exact COUNT(*) queries
 * per render on the shorter window; six hours keeps that fan-out off the request
 * path without making a single visible number staler.
 */
export const PUBLIC_STATS_CACHE_REVALIDATE_SECONDS = 6 * 60 * 60;

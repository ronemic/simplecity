# SimpleCity

SimpleCity turns public meeting agendas into plain-English civic action cards. It includes a Next.js public app, Supabase-backed admin portal, PrimeGov, IQM2, and Legistar scrapers, PDF extraction, and OpenRouter summarization pipeline for Foster City, San Mateo, San Mateo County, and Santa Clara County.

## Setup

1. Install dependencies:

   ```bash
   npm install
   npm run playwright:install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in Supabase and OpenRouter values. The default Supabase variables are kept for Foster City compatibility; San Mateo, San Mateo County, and Santa Clara County each use their own Supabase project:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL=
   NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY=
   SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_URL=
   NEXT_PUBLIC_SAN_MATEO_COUNTY_SUPABASE_ANON_KEY=
   SAN_MATEO_COUNTY_SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_URL=
   NEXT_PUBLIC_SANTA_CLARA_COUNTY_SUPABASE_ANON_KEY=
   SANTA_CLARA_COUNTY_SUPABASE_SERVICE_ROLE_KEY=
   SAN_MATEO_COUNTY_LEGISTAR_URL=https://sanmateocounty.legistar.com/Calendar.aspx
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ADMIN_PASSWORD=choose-a-long-random-password
   ```

4. Apply Supabase migrations from `supabase/migrations`.

   For a brand-new San Mateo County database, you can also run `supabase/bootstrap_county.sql` once in the Supabase SQL editor to create the full schema in one shot.

5. Run the app:

   ```bash
   npm run dev
   ```

## Scraper Commands

```bash
npm run scrape
npm run scrape:headful
npm run scrape:download
npm run scrape:html
npm run prepare-llm
npm run summarize
npm run pipeline
npm run pipeline:foster-city
npm run pipeline:san-mateo-city
npm run pipeline:san-mateo-county
npm run scrape:santa-clara-county
npm run pipeline:santa-clara-county
npm run pipeline:all
```

Local scraper output is written to `scraped-primegov/<jurisdiction-slug>/`. Source URLs are always the official source portal URLs, even when document downloads redirect behind the scenes.

Deployments run `npm run playwright:install` automatically before `next build` and start with `PLAYWRIGHT_BROWSERS_PATH=0`, so the Render runtime uses the Chromium revision bundled with the deployed app instead of depending on Render's global Playwright cache.

## Scheduled Scrapers

If Render Cron Jobs are available, run the production scraper outside the web request lifecycle. Create two Cron Job services from this repo, copy the same environment variables used by the web service, and use these settings:

| Job | Schedule | Build command | Command |
| --- | --- | --- | --- |
| San Mateo scraper | `0 10 * * *` | `npm install && npm run playwright:install` | `npm run pipeline:san-mateo-city` |
| San Mateo County scraper | `0 10 * * *` | `npm install && npm run playwright:install` | `npm run pipeline:san-mateo-county` |
| Foster City scraper | `30 10 * * *` | `npm install && npm run playwright:install` | `npm run pipeline:foster-city` |
| Santa Clara County scraper | `0 11 * * *` | `npm install && npm run playwright:install` | `npm run pipeline:santa-clara-county` |

Render schedules use UTC, so these examples run at 3:00 AM, 3:30 AM, and 4:00 AM Pacific during daylight saving time. Keep the jobs separate so one jurisdiction can fail or run long without blocking another.

If Render Cron Jobs are not available, keep the Supabase `nightly-scraper` Edge Function and create Supabase cron jobs that call it with one jurisdiction at a time:

```sql
select cron.schedule(
  'simplecity-san-mateo-scraper',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://depmismpaqqxefynaoaw.supabase.co/functions/v1/nightly-scraper?jurisdiction=san-mateo'
  );
  $$
);

select cron.schedule(
  'simplecity-foster-city-scraper',
  '30 10 * * *',
  $$
  select net.http_post(
    url := 'https://bdlxkdejlhrxbiribqyo.supabase.co/functions/v1/nightly-scraper?jurisdiction=foster-city'
  );
  $$
);
```

## Admin

The admin portal lives at `/admin` and uses a single shared password from `ADMIN_PASSWORD` in your `.env.local` file. After 3 failed login attempts, the browser session is locked out for 15 minutes.

## Source Transparency

Every generated SimpleCity card stores and displays an official source link. SimpleCity summarizes official public meeting documents; always check the original source before making formal decisions.

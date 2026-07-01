# SimpleCity

SimpleCity turns public meeting agendas into plain-English civic action cards. It includes a Next.js public app, Supabase-backed admin portal, PrimeGov, IQM2, and Legistar scrapers, PDF extraction, and an OpenRouter/Cerebras summarization pipeline for Foster City, San Mateo, San Mateo County, Santa Clara County, Mountain View, and San Francisco.

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

3. Fill in Supabase and LLM provider values. The default Supabase variables are kept for Foster City compatibility; San Mateo, San Mateo County, Santa Clara County, Mountain View, and San Francisco each use their own Supabase project:

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
   NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_URL=
   NEXT_PUBLIC_MOUNTAIN_VIEW_SUPABASE_ANON_KEY=
   MOUNTAIN_VIEW_SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_URL=
   NEXT_PUBLIC_SAN_FRANCISCO_SUPABASE_ANON_KEY=
   SAN_FRANCISCO_SUPABASE_SERVICE_ROLE_KEY=
   SAN_MATEO_COUNTY_LEGISTAR_URL=https://sanmateocounty.legistar.com/Calendar.aspx
   MOUNTAIN_VIEW_LEGISTAR_URL=https://mountainview.legistar.com/Calendar.aspx
   SAN_FRANCISCO_LEGISTAR_URL=https://sfgov.legistar.com/Calendar.aspx
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   CEREBRAS_API_KEY=
   CEREBRAS_MODEL=gpt-oss-120b
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ADMIN_PASSWORD=choose-a-long-random-password
   ```

   OpenRouter is tried first when configured. If it is rate-limited or unavailable and `CEREBRAS_API_KEY` is set, the summarizer falls back to Cerebras direct API.

4. Apply Supabase migrations from `supabase/migrations`.

   For a brand-new separate jurisdiction database, including Mountain View and San Francisco, you can also run `supabase/bootstrap_county.sql` once in the Supabase SQL editor to create the full schema in one shot.

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
npm run scrape:mountain-view
npm run scrape:mountain-view:download
npm run scrape:mountain-view:items
npm run pipeline:mountain-view
npm run scrape:san-francisco
npm run scrape:san-francisco:download
npm run scrape:san-francisco:items
npm run pipeline:san-francisco
npm run pipeline:all
```

Local scraper output is written to `scraped-primegov/<jurisdiction-slug>/`. Source URLs are always the official source portal URLs, even when document downloads redirect behind the scenes.

Deployments run `npm run playwright:install` automatically before `next build` and start with `PLAYWRIGHT_BROWSERS_PATH=0`, so the Render runtime uses the Chromium revision bundled with the deployed app instead of depending on Render's global Playwright cache.

## Scheduled Scrapers

The production scrapers run from the `Nightly scrapers` GitHub Actions workflow. GitHub cron schedules use UTC:

| Job | Schedule | Pacific time during daylight saving | Command |
| --- | --- | --- | --- |
| San Mateo scraper | `0 10 * * *` | 3:00 AM PDT | `npm run pipeline:san-mateo-city` |
| Foster City scraper | `30 10 * * *` | 3:30 AM PDT | `npm run pipeline:foster-city` |
| Santa Clara County scraper | `0 11 * * *` | 4:00 AM PDT | `npm run pipeline:santa-clara-county` |
| San Mateo County scraper | `15 11 * * *` | 4:15 AM PDT | `npm run pipeline:san-mateo-county` |
| Mountain View scraper | `20 12 * * *` | 5:20 AM PDT | `npm run pipeline:mountain-view` |
| San Francisco scraper | `40 12 * * *` | 5:40 AM PDT | `npm run pipeline:san-francisco` |

Keep the jobs separate so one jurisdiction can fail or run long without blocking another.

If you stop using GitHub Actions, the older Supabase `nightly-scraper` Edge Function can still be scheduled with Supabase cron jobs that call it one jurisdiction at a time:

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

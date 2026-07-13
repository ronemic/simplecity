# SimpleCity

SimpleCity turns public meeting agendas into plain-English civic action cards. It includes a Next.js public app, Supabase-backed admin portal, PrimeGov, IQM2, Legistar, official-site, and CivicClerk scrapers, PDF extraction, and an OpenRouter/Cerebras summarization pipeline for Foster City, San Mateo, San Mateo County, Santa Clara County, Mountain View, Los Altos, San Francisco, and Menlo Park.

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

3. Fill in the regional Supabase and LLM provider values. Legacy jurisdiction-specific variables remain available during database consolidation:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_URL=
   NEXT_PUBLIC_NORTH_SAN_MATEO_SUPABASE_ANON_KEY=
   NORTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SOUTH_SAN_MATEO_SUPABASE_URL=
   NEXT_PUBLIC_SOUTH_SAN_MATEO_SUPABASE_ANON_KEY=
   SOUTH_SAN_MATEO_SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_URL=
   NEXT_PUBLIC_SANTA_CLARA_REGION_SUPABASE_ANON_KEY=
   SANTA_CLARA_REGION_SUPABASE_SERVICE_ROLE_KEY=
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
   LOS_ALTOS_CIVICCLERK_URL=https://losaltosca.portal.civicclerk.com/
   OPENROUTER_API_KEY=
   OPENROUTER_API_KEY_2=
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   CEREBRAS_API_KEY=
   CEREBRAS_API_KEY_2=
   CEREBRAS_MODEL=gpt-oss-120b
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ADMIN_PASSWORD=choose-a-long-random-password
   RESEND_API_KEY=
   RESEND_FROM_EMAIL="SimpleCity <onboarding@resend.dev>"
   RESEND_REPLY_TO_EMAIL=
   ```

   OpenRouter is tried first when configured. If it is rate-limited or unavailable and `CEREBRAS_API_KEY` is set, the summarizer falls back to Cerebras direct API.

4. Apply Supabase migrations from `supabase/migrations`.

   For a brand-new separate jurisdiction database, including Mountain View and San Francisco, you can also run `supabase/bootstrap_county.sql` once in the Supabase SQL editor to create the full schema in one shot.

### Regional databases

SimpleCity can route multiple jurisdictions into four regional Supabase projects while keeping the existing jurisdiction slugs and public URLs unchanged. Regional environment variables take precedence over the legacy per-jurisdiction variables; the legacy variables remain supported during cutover.

North San Mateo uses the existing San Mateo County credentials as its destination fallback, so San Mateo City and Foster City switch together after the regional schema and data copy are complete.

Santa Clara uses the existing Santa Clara County credentials as its destination fallback. Until the regional schema migration is applied there, the application keeps the legacy conflict keys; enable the dedicated regional variables after the composite constraints are installed.

Apply `20260711000000_add_regional_database_support.sql` to every destination project before copying data. Preview a jurisdiction copy with:

```bash
npm run migrate:jurisdiction -- --jurisdiction=mountain-view
```

Add `--execute` only after the dry-run counts are verified. Use `--include-control-data` when moving San Mateo City, the current default project, into North San Mateo. The copy preserves database UUIDs and is idempotent; it does not delete or disable the source project.

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
npm run scrape:menlo-park
npm run pipeline:menlo-park
npm run scrape:los-altos
npm run scrape:los-altos:download
npm run pipeline:los-altos
npm run pipeline:all
npm run email:digests
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
| Menlo Park scraper | `10 13 * * *` | 6:10 AM PDT | `npm run pipeline:menlo-park` |
| Los Altos scraper | `30 13 * * *` | 6:30 AM PDT | `npm run pipeline:los-altos` |
| Weekly email digests | `0 17 * * 1` | Monday 10:00 AM PDT | `npm run email:digests` |

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

## Email Notifications

SimpleCity sends email through the Resend HTTP API. For the free Resend plan, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env.local`; `"SimpleCity <onboarding@resend.dev>"` is useful for initial testing, and a verified domain address should replace it before real resident notifications.

Public subscriptions live at `/subscribe`. Subscribers choose one or more jurisdictions, receive a confirmation email, and only become active after clicking the confirmation link.

Admins can send a test digest with the protected `POST /api/admin/email-test` route:

```json
{
  "to": "you@example.com",
  "jurisdiction": "san-mateo-city",
  "limit": 5
}
```

Weekly subscriber digests can be sent with:

```bash
npm run email:digests
npm run email:digests -- --dry-run
```

## Source Transparency

Every generated SimpleCity card stores and displays an official source link. SimpleCity summarizes official public meeting documents; always check the original source before making formal decisions.

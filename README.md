# SimpleCity

SimpleCity turns PrimeGov meeting agendas into plain-English civic action cards. It includes a Next.js public app, Supabase-backed admin portal, PrimeGov scraper, PDF extraction, and OpenRouter summarization pipeline for Foster City and San Mateo City.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in Supabase and OpenRouter values. The default Supabase variables are kept for Foster City compatibility; San Mateo City uses its own Supabase project:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_URL=
   NEXT_PUBLIC_SAN_MATEO_CITY_SUPABASE_ANON_KEY=
   SAN_MATEO_CITY_SUPABASE_SERVICE_ROLE_KEY=
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ADMIN_PASSWORD=choose-a-long-random-password
   ```

4. Apply Supabase migrations from `supabase/migrations`.

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
npm run pipeline:all
```

Local scraper output is written to `scraped-primegov/<jurisdiction-slug>/`. Source URLs are always the official PrimeGov URLs, even when PDF downloads redirect behind the scenes.

## Admin

The admin portal lives at `/admin` and uses a single shared password from `ADMIN_PASSWORD` in your `.env.local` file. After 3 failed login attempts, the browser session is locked out for 15 minutes.

## Source Transparency

Every generated SimpleCity card stores and displays an official source link. SimpleCity summarizes official public meeting documents; always check the original source before making formal decisions.

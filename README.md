# SimpleCity

SimpleCity turns Foster City PrimeGov meeting agendas into plain-English civic action cards. It includes a Next.js public app, Supabase-backed admin portal, PrimeGov scraper, PDF extraction, and OpenRouter summarization pipeline.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in Supabase and OpenRouter values:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=openai/gpt-oss-120b:free
   SCRAPER_BASE_URL=https://fostercity.primegov.com/public/portal
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ADMIN_EMAILS=comma,separated,emails
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
```

Local scraper output is written to `scraped-primegov/`. Source URLs are always the official PrimeGov URLs, even when PDF downloads redirect behind the scenes.

## Admin

The admin portal lives at `/admin` and uses Supabase Auth. Server-side admin checks require the signed-in email to be listed in `ADMIN_EMAILS` or present in the optional `admins` table.

## Source Transparency

Every generated SimpleCity card stores and displays an official source link. SimpleCity summarizes official public meeting documents; always check the original source before making formal decisions.

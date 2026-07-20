# Contributing to SimpleCity

Thank you for helping make local government information easier to understand.

## Development

1. Install Node.js 22.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add only credentials you control.
4. Run `npm run playwright:install` if you are working on a scraper.
5. Run the app with `npm run dev`.

Before opening a pull request, run:

```bash
npm run lint
npm test
```

## Pull requests

- Keep changes focused and explain how they were verified.
- Add or update tests when behavior changes.
- Do not commit `.env` files, credentials, private resident information, downloaded meeting files, or scraper output.
- Use fixtures containing public or synthetic data only.
- Do not run database migrations, repair scripts, backfills, email jobs, or live scraper writes against production as part of a pull request.

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

# Alice Word Game — Supabase setup

Supabase project: `drxdsooffyadkjrbchxx`

## 1. Apply the database migration
In the Supabase Dashboard, open **SQL Editor**, paste and run:
`supabase/migrations/202611080001_alice_game_schema.sql`

## 2. Import dictionaries (run locally, never in the browser)
Install Node.js, then from the repository root run:

```bash
npm install
```

Set these environment variables locally:
- `SUPABASE_URL=https://drxdsooffyadkjrbchxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase Project Settings → API>`

Then run:

```bash
npm run import:dictionaries
```

Never commit the service-role key or put it in frontend code.

## 3. Deploy the Edge Function
Install and authenticate the Supabase CLI, link this project, then deploy:

```bash
supabase login
supabase link --project-ref drxdsooffyadkjrbchxx
supabase functions deploy alice-game
```

The function uses the project-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Do not expose the service-role key.

## 4. Enable Google sign-in
In Supabase Dashboard → Authentication → Providers → Google, enable Google and enter the OAuth Client ID and Client Secret from Google Cloud Console. Add the deployed site URL to Authentication → URL Configuration → Redirect URLs.

## 5. Frontend public configuration
The browser needs only the project URL and the **publishable/anon key**. Put them in `supabase-config.js` when the frontend integration is ready. Never use the service-role key in the browser.

## Security notes
- The browser never receives the hidden answer list.
- Round creation and word claims are checked by the Edge Function against the stored board and private round-word table.
- Score and personal-best writes are server-side only.
- Public leaderboard rows contain display names and scores only; email addresses remain in Supabase Auth and are not exposed.

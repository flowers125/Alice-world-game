# Alice Word Game — Supabase setup

Supabase project: `drxdsooffyadkjrbchxx`

## 1. Apply the database migration
In the Supabase Dashboard, open **SQL Editor** and run these files in order:
1. `supabase/migrations/202611080001_alice_game_schema.sql`
2. `supabase/migrations/202611080002_atomic_word_claims.sql`
3. `supabase/migrations/202611080003_profile_name_collision.sql`

## 2. Import dictionaries (run locally, never in the browser)
Install Node.js, then from the repository root run:

```bash
npm install
```

In Windows PowerShell, set the variables in the current terminal (paste the service-role key locally; do not send it in chat or commit it):

```powershell
$env:SUPABASE_URL = "https://drxdsooffyadkjrbchxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "PASTE_SERVICE_ROLE_KEY_HERE"
npm run import:dictionaries
```

The importer uploads the word lists in batches. Keep the service-role key only in your local terminal environment.

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
Open `supabase-config.js` and replace `PASTE_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with the project publishable/anon key from Supabase Project Settings → API. The project URL is already set. This key is intended for browser use; never use the service-role key in the browser. The page loads the Supabase JS v2 client from jsDelivr.

## Security notes
- The browser never receives the hidden answer list.
- Round creation and word claims are checked by the Edge Function against the stored board and private round-word table.
- Score and personal-best writes are server-side only.
- Public leaderboard rows contain display names and scores only; email addresses remain in Supabase Auth and are not exposed.

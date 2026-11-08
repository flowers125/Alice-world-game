# Alice Word Game

A bilingual (Vietnamese / English) 10×10 word-search game.

## Run locally

Serve the repository root with any static web server. Opening `index.html` directly may block dictionary fetches in some browsers.

## Frontend configuration

`supabase-config.js` contains the Supabase project URL and **public publishable key**. These are intended for browser use. Never put a service-role key in this file.

The game supports guest play. Signed-in play uses the server-generated board, server-side word validation, and server-side scoring.

## Deploy with Cloudflare Pages

This is a static site; no build step is required.
1. Connect this GitHub repository to Cloudflare Pages.
2. Select the `main` production branch.
3. Set the framework preset to **None**.
4. Set the build command to `exit 0` (or leave it blank).
5. Set the build output directory to `.` (the repository root).
6. After the first deployment, add the site's production URL to Supabase Authentication → URL Configuration → Redirect URLs.

The site entry point is the root `index.html`.

## Supabase

Project URL: `https://drxdsooffyadkjrbchxx.supabase.co`

Edge Function: `alice-game`

Source: `supabase/functions/alice-game/index.ts`

The function requires an authenticated Supabase session (`verify_jwt = true`) and independently validates the user token. It handles:
- `start`: creates a 60-second round and returns a server-generated board.
- `claim`: validates a continuous straight path against the hidden words and records a word atomically.
- `finish`: closes the round and updates the personal best.

The database stores profiles, dictionary words, rounds, found words, and personal bests. The public leaderboard RPC returns display names, scores, and achievement times only. Direct access to `personal_bests` is blocked by RLS. Browser roles also have no direct access to `game_rounds` or `round_words`, keeping hidden target words and round internals server-only. Signed-in users can read only their own profile row; public names are returned through the curated leaderboard RPC.

### Google sign-in setup

To enable Google login:
1. Create a Google OAuth web client in Google Cloud Console.
2. In Supabase Authentication → Providers → Google, enable Google and enter the OAuth Client ID and Client Secret.
3. In Supabase Authentication → URL Configuration, add the deployed site URL to the allowed redirect URLs.
4. Keep the OAuth client secret in Supabase only; never commit it to this repository.

Until Google OAuth is configured, users can play as guests. Guest scores are local and are not submitted to the online leaderboard.

## Game rules

- 10×10 board; words can run horizontally, vertically, or diagonally, in either direction.
- Each round lasts 60 seconds.
- Normal scoring: 2 points for the first word, 3 additional points for the second (5 total), then 7 additional points for the third and later words (12 total from the third onward).
- Very Hard adds 3 points per found word to the normal cumulative score: 5, 11, 21, 24, 27, ...

## Dictionary

- Vietnamese: 13,282 entries
- English: 472 entries

The text dictionaries are in `dictionaries/vi.txt` and `dictionaries/en.txt`; the database copy is used for authenticated rounds.

## Important files

- `index.html`, `style.css`: interface
- `script.js`: guest game and dictionary loading
- `backend.js`: Supabase authentication and online-game integration
- `supabase-config.js`: public browser configuration
- `supabase/functions/alice-game/index.ts`: Edge Function source

## Testing

See [TESTING.md](TESTING.md) for the guest, scoring, signed-in, and security acceptance checklist. GitHub Actions validates frontend JavaScript syntax, required assets, and the Supabase Edge Function type check on pushes to `main` and pull requests.

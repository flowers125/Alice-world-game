# Alice Word Game — Test Checklist

## Guest mode
- [ ] Open the deployed site and confirm both dictionaries finish loading.
- [ ] Start a Vietnamese round and an English round.
- [ ] Confirm the board is 10×10 and the timer starts at 60 seconds.
- [ ] Find words horizontally, vertically, diagonally, forwards, and backwards.
- [ ] Confirm the same word cannot score twice.
- [ ] Confirm no target-word list is shown.
- [ ] Confirm guest mode clearly says scores are not saved online.

## Scoring
Normal mode:
- [ ] First valid word: 2 points.
- [ ] Second valid word: 5 total points.
- [ ] Third and later valid words: 12 total points.

Very Hard mode:
- [ ] First valid word: 5 points.
- [ ] Second valid word: 11 total points.
- [ ] Third valid word: 21 total points.
- [ ] Fourth valid word: 24 total points.
- [ ] Fifth valid word: 27 total points.

## Signed-in mode
- [ ] Sign in with Google.
- [ ] Save a display name and reload the page; confirm it persists.
- [ ] Start a round and confirm the board comes from the server.
- [ ] Finish a round and confirm the personal best updates.
- [ ] Open the leaderboard and switch language/difficulty filters.
- [ ] Sign out and confirm the game returns to guest mode.

## Security checks
- [ ] Browser roles cannot directly read `dictionary_words`, `game_rounds`, `round_words`, `personal_bests`, or the `leaderboard` view.
- [ ] Guest leaderboard requests use only the curated leaderboard RPC; no personal or round data is exposed.
- [ ] Edge Function rejects requests without a valid user session.
- [ ] Edge Function rejects repeated-cell selections and non-straight paths.
- [ ] Online timer ends at the server-provided expiry time.
- [ ] Signing out during an online round finishes and saves that round first.

## Deployment prerequisites
- Configure Google OAuth in Supabase.
- Add the deployed site's URL to Supabase Auth redirect URLs.
- Use the Cloudflare Pages settings documented in `README.md`.


## Personal-best persistence
- [ ] A guest can play, but their score is never submitted or saved online.
- [ ] A Google-signed-in user can submit valid words and the server returns the authoritative score.
- [ ] At round completion, the score is saved only if it exceeds that account's existing personal best for the same language and difficulty.
- [ ] A lower-scoring round does not replace the existing personal best.
- [ ] A non-Google Supabase session is rejected by the game Edge Function.
- [ ] The leaderboard displays each account's best score, never a sum of rounds.

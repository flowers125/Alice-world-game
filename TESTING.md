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
- [ ] Browser roles cannot directly read `game_rounds`, `round_words`, or `personal_bests`.
- [ ] Guest users can read only the curated leaderboard RPC output.
- [ ] Edge Function rejects requests without a valid user session.

## Deployment prerequisites
- Configure Google OAuth in Supabase.
- Add the deployed site's URL to Supabase Auth redirect URLs.
- Use the Cloudflare Pages settings documented in `README.md`.

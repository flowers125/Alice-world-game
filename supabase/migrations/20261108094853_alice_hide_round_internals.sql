-- Keep hidden round contents and found-word records server-only.
-- The Edge Function uses the service role; browser clients use its API.
drop policy if exists "Users can read their own rounds" on public.game_rounds;
drop policy if exists "Users can read their own found words" on public.round_words;

revoke all privileges on table public.game_rounds from anon, authenticated;
revoke all privileges on table public.round_words from anon, authenticated;

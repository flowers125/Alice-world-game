-- Minimize direct browser access; the Edge Function and curated RPCs
-- are the only paths that need privileged dictionary, round, and score data.
revoke all privileges on table public.dictionary_words from anon, authenticated;
drop policy if exists "Active dictionary is readable" on public.dictionary_words;

revoke all privileges on table public.personal_bests from anon, authenticated;
revoke all privileges on table public.leaderboard from anon, authenticated;

revoke all privileges on table public.profiles from anon;
revoke delete, insert, references, trigger, truncate on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;

revoke all privileges on table public.game_rounds from anon, authenticated;
revoke all privileges on table public.round_words from anon, authenticated;

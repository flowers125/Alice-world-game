-- Remove direct client access to personal best rows.
-- Public scores are served through the curated leaderboard RPC only.
drop policy if exists "Personal bests are public" on public.personal_bests;

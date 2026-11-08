-- Prevent direct exposure of user UUIDs and round IDs through personal_bests.
-- Public leaderboard access is provided by get_alice_leaderboard(), which
-- returns only display_name, score, and achieved_at.
drop policy if exists "Personal bests are public" on public.personal_bests;

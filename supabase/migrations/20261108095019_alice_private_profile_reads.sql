-- Limit profile reads to the signed-in user's own profile row.
-- Public leaderboard names are exposed only through get_alice_leaderboard().
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

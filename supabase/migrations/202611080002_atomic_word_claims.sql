-- Atomic word claims prevent two simultaneous requests from overwriting the score.
create or replace function public.claim_alice_word(
  p_round_id uuid,
  p_user_id uuid,
  p_word text
)
returns table(found boolean, found_count integer, score integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.game_rounds%rowtype;
  inserted_word text;
  total integer;
  points integer;
begin
  select * into r
  from public.game_rounds
  where id = p_round_id and user_id = p_user_id
  for update;

  if not found then
    return query select false, 0, 0;
    return;
  end if;

  if r.status <> 'active' or r.expires_at <= now() then
    update public.game_rounds set status = 'expired' where id = p_round_id;
    return query select false, r.found_count, r.score;
    return;
  end if;

  insert into public.round_found_words(round_id, user_id, word)
  select p_round_id, p_user_id, rw.word
  from public.round_words rw
  where rw.round_id = p_round_id and rw.word = p_word
  on conflict (round_id, word) do nothing
  returning word into inserted_word;

  if inserted_word is null then
    return query select false, r.found_count, r.score;
    return;
  end if;

  select count(*)::integer into total
  from public.round_found_words where round_id = p_round_id;

  points := case when total = 1 then 2 when total = 2 then 5 else 12 end;
  if r.difficulty = 'very-hard' then points := points + total * 3; end if;

  update public.game_rounds
  set found_count = total, score = points
  where id = p_round_id;

  return query select true, total, points;
end;
$$;

revoke all on function public.claim_alice_word(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_alice_word(uuid,uuid,text) to service_role;

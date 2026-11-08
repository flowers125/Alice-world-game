-- Add the Very Easy mode with server-authoritative half scoring.
alter table public.game_rounds drop constraint if exists game_rounds_difficulty_check;
alter table public.game_rounds add constraint game_rounds_difficulty_check
  check (difficulty in ('very-easy','normal','very-hard'));

alter table public.personal_bests drop constraint if exists personal_bests_difficulty_check;
alter table public.personal_bests add constraint personal_bests_difficulty_check
  check (difficulty in ('very-easy','normal','very-hard'));

create or replace function public.alice_record_word(
  p_round_id uuid,
  p_user_id uuid,
  p_normalized text,
  p_points integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r public.game_rounds%rowtype;
  inserted_id bigint;
  prior_count integer;
  next_count integer;
  old_total integer;
  new_total integer;
  delta_points integer;
begin
  select * into r from public.game_rounds
  where id=p_round_id and user_id=p_user_id
  for update;

  if not found or r.status <> 'active' or now() > r.expires_at then
    return jsonb_build_object('ok',false,'reason','round_not_active');
  end if;

  select count(*) into prior_count from public.round_words where round_id=p_round_id;
  next_count := prior_count + 1;

  old_total := case when prior_count=0 then 0 when prior_count=1 then 2 when prior_count=2 then 5 else 12 end;
  new_total := case when next_count=0 then 0 when next_count=1 then 2 when next_count=2 then 5 else 12 end;

  if r.difficulty='very-easy' then
    old_total := floor(old_total::numeric / 2)::integer;
    new_total := floor(new_total::numeric / 2)::integer;
  elsif r.difficulty='very-hard' then
    old_total := old_total + prior_count*3;
    new_total := new_total + next_count*3;
  end if;
  delta_points := new_total-old_total;

  insert into public.round_words(round_id,user_id,normalized,points)
  values(p_round_id,p_user_id,p_normalized,delta_points)
  on conflict(round_id,normalized) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object('ok',false,'reason','already_found');
  end if;

  update public.game_rounds set score=new_total where id=p_round_id;
  return jsonb_build_object('ok',true,'added',delta_points,'score',new_total);
end;
$function$;

-- Keep Very Easy scoring mathematically exact (including half points).
alter table public.game_rounds alter column score type numeric(10,1) using score::numeric(10,1);
alter table public.personal_bests alter column score type numeric(10,1) using score::numeric(10,1);
alter table public.round_words alter column points type numeric(10,1) using points::numeric(10,1);

create or replace function public.alice_record_word(
  p_round_id uuid, p_user_id uuid, p_normalized text, p_points integer default 0
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  r public.game_rounds%rowtype;
  inserted_id bigint;
  prior_count integer;
  next_count integer;
  old_total numeric(10,1);
  new_total numeric(10,1);
  delta_points numeric(10,1);
begin
  select * into r from public.game_rounds where id=p_round_id and user_id=p_user_id for update;
  if not found or r.status <> 'active' or now() > r.expires_at then
    return jsonb_build_object('ok',false,'reason','round_not_active');
  end if;
  select count(*) into prior_count from public.round_words where round_id=p_round_id;
  next_count := prior_count + 1;
  old_total := case when prior_count=0 then 0 when prior_count=1 then 2 when prior_count=2 then 5 else 12 end;
  new_total := case when next_count=0 then 0 when next_count=1 then 2 when next_count=2 then 5 else 12 end;
  if r.difficulty='very-easy' then
    old_total := old_total / 2.0;
    new_total := new_total / 2.0;
  elsif r.difficulty='very-hard' then
    old_total := old_total + prior_count*3;
    new_total := new_total + next_count*3;
  end if;
  delta_points := new_total-old_total;
  insert into public.round_words(round_id,user_id,normalized,points)
  values(p_round_id,p_user_id,p_normalized,delta_points)
  on conflict(round_id,normalized) do nothing returning id into inserted_id;
  if inserted_id is null then return jsonb_build_object('ok',false,'reason','already_found'); end if;
  update public.game_rounds set score=new_total where id=p_round_id;
  return jsonb_build_object('ok',true,'added',delta_points,'score',new_total);
end;
$function$;

create or replace function public.alice_finish_round(p_round_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  r public.game_rounds%rowtype;
  best_score numeric(10,1);
begin
  select * into r from public.game_rounds
  where id=p_round_id and user_id=p_user_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','round_not_found'); end if;
  if r.status = 'active' then
    update public.game_rounds
    set status = case when now() >= expires_at then 'expired' else 'finished' end,
        finished_at = now()
    where id = p_round_id
    returning * into r;
  end if;
  insert into public.personal_bests(user_id,language,difficulty,score,achieved_at,round_id)
  values (p_user_id,r.language,r.difficulty,r.score,coalesce(r.finished_at,now()),r.id)
  on conflict (user_id,language,difficulty) do update
    set score=excluded.score, achieved_at=excluded.achieved_at, round_id=excluded.round_id
    where excluded.score > public.personal_bests.score;
  select score into best_score from public.personal_bests
  where user_id=p_user_id and language=r.language and difficulty=r.difficulty;
  return jsonb_build_object('ok',true,'score',r.score,'personal_best',best_score,'status',r.status);
end;
$function$;
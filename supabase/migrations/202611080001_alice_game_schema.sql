-- Alice Word Game: secure backend foundation
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 20)
);
create unique index if not exists profiles_display_name_ci on public.profiles (lower(display_name));

create table if not exists public.dictionary_words (
  language text not null check (language in ('vi','en')),
  word text not null,
  normalized text not null,
  primary key (language, normalized),
  constraint dictionary_word_length check (char_length(normalized) between 2 and 10)
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('vi','en')),
  difficulty text not null check (difficulty in ('normal','very-hard')),
  grid jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','finished','expired')),
  found_count integer not null default 0 check (found_count >= 0),
  score integer not null default 0 check (score >= 0)
);
create index if not exists game_rounds_user_created on public.game_rounds(user_id, created_at desc);

create table if not exists public.round_words (
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  word text not null,
  path jsonb not null,
  primary key (round_id, word)
);

create table if not exists public.round_found_words (
  round_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  found_at timestamptz not null default now(),
  primary key (round_id, word),
  foreign key (round_id, word) references public.round_words(round_id, word) on delete cascade
);

create table if not exists public.personal_bests (
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (language in ('vi','en')),
  difficulty text not null check (difficulty in ('normal','very-hard')),
  score integer not null check (score >= 0),
  achieved_at timestamptz not null default now(),
  round_id uuid references public.game_rounds(id) on delete set null,
  primary key (user_id, language, difficulty)
);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(coalesce(new.email,''),'@',1), 'Player'), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_alice on auth.users;
create trigger on_auth_user_created_alice
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create or replace function public.pick_dictionary_words(p_language text, p_limit integer default 1200)
returns table(word text)
language sql security definer set search_path = public
as $$
  select d.word
  from public.dictionary_words d
  where d.language = p_language and p_language in ('vi','en')
  order by random()
  limit least(greatest(p_limit, 1), 3000);
$$;

alter table public.profiles enable row level security;
alter table public.dictionary_words enable row level security;
alter table public.game_rounds enable row level security;
alter table public.round_words enable row level security;
alter table public.round_found_words enable row level security;
alter table public.personal_bests enable row level security;

drop policy if exists "Profiles are publicly readable without email" on public.profiles;
create policy "Profiles are publicly readable without email"
on public.profiles for select using (true);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Dictionary readable" on public.dictionary_words;
create policy "Dictionary readable" on public.dictionary_words for select using (true);

drop policy if exists "Users read own rounds" on public.game_rounds;
create policy "Users read own rounds" on public.game_rounds for select using (auth.uid() = user_id);

drop policy if exists "Personal bests public read" on public.personal_bests;
create policy "Personal bests public read"
on public.personal_bests for select using (true);

-- Round internals are intentionally not exposed to browser clients.
revoke all on public.round_words from anon, authenticated;
revoke all on public.round_found_words from anon, authenticated;
revoke insert, update, delete on public.game_rounds from anon, authenticated;
revoke insert, update, delete on public.personal_bests from anon, authenticated;
revoke insert, update, delete on public.dictionary_words from anon, authenticated;
revoke execute on function public.pick_dictionary_words(text, integer) from public, anon, authenticated;
grant execute on function public.pick_dictionary_words(text, integer) to service_role;

-- Public leaderboard query: email is never selected or exposed.
create or replace function public.get_alice_leaderboard(
  p_language text,
  p_difficulty text,
  p_limit integer default 20
)
returns table(rank bigint, display_name text, score integer, achieved_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select row_number() over(order by pb.score desc, pb.achieved_at asc) as rank,
         p.display_name, pb.score, pb.achieved_at
  from public.personal_bests pb
  join public.profiles p on p.id = pb.user_id
  where pb.language = p_language and pb.difficulty = p_difficulty
  order by pb.score desc, pb.achieved_at asc
  limit least(greatest(p_limit,1),20);
$$;
grant execute on function public.get_alice_leaderboard(text,text,integer) to anon, authenticated;

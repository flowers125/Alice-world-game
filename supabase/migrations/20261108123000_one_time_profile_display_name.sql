-- Make a profile display name a one-time choice.
alter table public.profiles
  add column if not exists display_name_set_at timestamptz;

create or replace function public.enforce_one_time_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- OAuth metadata is only a suggested starting value, not a chosen name.
    new.display_name_set_at := null;
    return new;
  end if;

  if old.display_name_set_at is not null
     and new.display_name is distinct from old.display_name then
    raise exception 'Display name can only be set once'
      using errcode = '23514';
  end if;

  if old.display_name_set_at is null
     and new.display_name is distinct from old.display_name then
    new.display_name_set_at := now();
  else
    new.display_name_set_at := old.display_name_set_at;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_one_time_name on public.profiles;
create trigger profiles_one_time_name
before insert or update of display_name, display_name_set_at
on public.profiles
for each row execute function public.enforce_one_time_profile_name();

-- Lock a display name on the first explicit profile save, even when it
-- matches the Google-provided prefilled value.
create or replace function public.enforce_one_time_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.display_name_set_at := null;
    return new;
  end if;

  if old.display_name_set_at is not null then
    if new.display_name is distinct from old.display_name then
      raise exception 'Display name can only be set once'
        using errcode = '23514';
    end if;
    new.display_name_set_at := old.display_name_set_at;
    return new;
  end if;

  if new.display_name is not null and btrim(new.display_name) <> '' then
    new.display_name_set_at := now();
  else
    new.display_name_set_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_one_time_name on public.profiles;
create trigger profiles_one_time_name
before insert or update of display_name, display_name_set_at
on public.profiles
for each row execute function public.enforce_one_time_profile_name();

-- Existing non-empty names predate this corrected trigger. Lock them now
-- rather than leaving accounts that already chose a name editable.
update public.profiles
set display_name_set_at = coalesce(display_name_set_at, updated_at, created_at, now())
where display_name is not null
  and btrim(display_name) <> ''
  and display_name_set_at is null;

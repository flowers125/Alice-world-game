-- Avoid OAuth signup failures when two users share the same Google display name.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  candidate text;
begin
  candidate := left(
    coalesce(
      nullif(new.raw_user_meta_data->>'name',''),
      nullif(split_part(coalesce(new.email,''),'@',1),''),
      'Player'
    ),
    20
  );
  begin
    insert into public.profiles(id, display_name) values (new.id, candidate)
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles(id, display_name)
    values (new.id, left(candidate,13) || '-' || left(new.id::text,6))
    on conflict (id) do nothing;
  end;
  return new;
end;
$$;

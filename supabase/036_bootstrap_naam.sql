-- Naam die bij het aanmaken van een account is ingevuld, als omslagnaam vastleggen
-- (alleen als er nog geen instellingenrij bestaat, zodat latere wijzigingen in Instellingen nooit overschreven worden)
create or replace function public.bootstrap_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_name is null then return; end if;
  if char_length(v_name) > 24 or v_name !~ '^[[:alnum:] .''&-]+$' then return; end if;
  insert into public.collectors (user_id, display_name, cover_color, page_color)
  values (v_uid, v_name, 'bordeaux', 'zwart')
  on conflict (user_id) do nothing;
end $$;

revoke all on function public.bootstrap_name(text) from public, anon;
grant execute on function public.bootstrap_name(text) to authenticated;

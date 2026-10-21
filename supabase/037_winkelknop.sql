-- =====================================================================
-- Vineder database – migratie 037: "Zoek in de winkel" op een leeg vak
-- 1) 18+-bevestiging per verzamelaar (één keer, vóór de eerste winkellink)
-- 2) Anonieme klikteller (zonder gebruikers-ID) om te zien welke winkels en vakken ertoe doen
-- Alleen toevoegingen; bestaande gegevens blijven ongemoeid. Veilig om opnieuw te draaien.
-- =====================================================================

alter table public.collectors add column if not exists adult_confirmed_at timestamptz;

create or replace function public.confirm_adult()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.collectors (user_id, adult_confirmed_at) values (v_uid, now())
  on conflict (user_id) do update
    set adult_confirmed_at = coalesce(public.collectors.adult_confirmed_at, now());
end $$;

revoke all on function public.confirm_adult() from public, anon;
grant execute on function public.confirm_adult() to authenticated;

-- Klikken op een winkellink. Bewust zonder user_id: we willen alleen weten wat er geklikt wordt.
create table if not exists public.shop_clicks (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  shop       text not null check (char_length(shop) between 1 and 40),
  set_id     text not null check (char_length(set_id) between 1 and 60),
  slot       text not null check (char_length(slot) between 1 and 80)
);
alter table public.shop_clicks enable row level security;
revoke all on public.shop_clicks from public, anon, authenticated;
revoke all on sequence public.shop_clicks_id_seq from public, anon, authenticated;

create or replace function public.log_shop_click(p_shop text, p_set text, p_slot text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if coalesce(p_shop, '') = '' or coalesce(p_set, '') = '' or coalesce(p_slot, '') = '' then return; end if;
  insert into public.shop_clicks (shop, set_id, slot)
  values (left(p_shop, 40), left(p_set, 60), left(p_slot, 80));
end $$;

revoke all on function public.log_shop_click(text, text, text) from public, anon;
grant execute on function public.log_shop_click(text, text, text) to authenticated;

-- Bekijken: select * from public.shop_clicks_overzicht;
create or replace view public.shop_clicks_overzicht
with (security_invoker = true) as
select shop, set_id, slot, count(*) as klikken, max(created_at) as laatste
from public.shop_clicks
group by shop, set_id, slot
order by klikken desc, laatste desc;
revoke all on public.shop_clicks_overzicht from public, anon, authenticated;

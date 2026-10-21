-- =====================================================================
-- Vineder database – migratie 038: winkelklikken in het beheerderscentrum
-- Opgeteld per winkel en per vak, nooit per persoon (shop_clicks bevat geen gebruikers-ID).
-- Alleen voor de beheerder. Veilig om opnieuw te draaien.
-- =====================================================================
create or replace function public.admin_shop_clicks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vi_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.shop_clicks),
    'last7', (select count(*) from public.shop_clicks where created_at > now() - interval '7 days'),
    'since', (select min(created_at) from public.shop_clicks),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object('shop', shop, 'n', n) order by n desc), '[]'::jsonb)
              from (select shop, count(*) n from public.shop_clicks group by shop) s),
    'slots', (select coalesce(jsonb_agg(jsonb_build_object('set', set_id, 'slot', slot, 'n', n) order by n desc), '[]'::jsonb)
              from (select set_id, slot, count(*) n from public.shop_clicks group by set_id, slot order by n desc limit 10) t)
  );
end $$;
revoke all on function public.admin_shop_clicks() from public, anon;
grant execute on function public.admin_shop_clicks() to authenticated;

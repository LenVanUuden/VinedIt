-- =====================================================================
-- Vineder database – migratie 039: welke wijnen zijn vandaag gescand
-- Alleen de nieuwe kaarten van vandaag (eerste keer dat iemand die wijn scant),
-- opgeteld per wijn, nooit per verzamelaar. Herscans van al-bezeten wijnen
-- zitten niet in deze lijst (die staan niet aan een wijn gekoppeld).
-- Alleen voor de beheerder. Veilig om opnieuw te draaien.
-- =====================================================================
create or replace function public.admin_scans_today()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vi_is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'naam', w.naam, 'maker', w.maker, 'jaar', w.jaar, 'n', x.n
      ) order by x.n desc, w.naam), '[]'::jsonb)
    from (
      select wine_id, count(*) n
      from public.cards
      where created_at::date = current_date
      group by wine_id
    ) x
    join public.wines w on w.id = x.wine_id
  );
end $$;
revoke all on function public.admin_scans_today() from public, anon;
grant execute on function public.admin_scans_today() to authenticated;

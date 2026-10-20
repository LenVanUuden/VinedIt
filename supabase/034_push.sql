-- Pushberichten: weekendseintje op vrijdag (standaard 17:30), niet als je die dag al scande
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- VAPID-sleutels: alleen de Edge Function (service role) leest en schrijft deze
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;

-- Eén rij per toestel (abonnement van de browser)
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  send_time time not null default '17:30',
  enabled boolean not null default true,
  last_sent date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;
create policy "eigen abonnementen lezen" on public.push_subs for select using (user_id = auth.uid());

-- Toestel aanmelden (of opnieuw koppelen aan deze gebruiker). Tijdstip erft van je andere toestellen.
create or replace function public.push_save(p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t time;
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  if length(p_endpoint) > 1000 or p_endpoint !~ '^https://' then raise exception 'ongeldig'; end if;
  select send_time into t from push_subs where user_id = auth.uid() order by updated_at desc limit 1;
  insert into push_subs(endpoint, user_id, p256dh, auth, send_time, enabled)
  values (p_endpoint, auth.uid(), left(p_p256dh, 200), left(p_auth, 100), coalesce(t, '17:30'), true)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
    enabled = true, send_time = coalesce(t, push_subs.send_time), updated_at = now();
  return jsonb_build_object('ok', true, 'time', to_char(coalesce(t, '17:30'), 'HH24:MI'));
end $$;

-- Instellingen voor al je toestellen tegelijk
create or replace function public.push_settings(p_enabled boolean, p_time time)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'niet ingelogd'; end if;
  if p_time < '08:00' or p_time > '23:00' then raise exception 'tijdstip buiten bereik'; end if;
  update push_subs set enabled = p_enabled, send_time = p_time, updated_at = now() where user_id = auth.uid();
  return found;
end $$;

create or replace function public.push_my()
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('devices', count(*), 'enabled', coalesce(bool_or(enabled), false),
    'time', coalesce(to_char((array_agg(send_time order by updated_at desc))[1], 'HH24:MI'), '17:30'))
  from push_subs where user_id = auth.uid();
$$;

revoke all on function public.push_save(text, text, text) from public, anon;
revoke all on function public.push_settings(boolean, time) from public, anon;
revoke all on function public.push_my() from public, anon;
grant execute on function public.push_save(text, text, text) to authenticated;
grant execute on function public.push_settings(boolean, time) to authenticated;
grant execute on function public.push_my() to authenticated;

-- Elke 15 minuten op vrijdag (UTC) kijkt de functie wie aan de beurt is; dubbel sturen kan niet (last_sent)
select cron.unschedule(jobid) from cron.job where jobname = 'push-weekend';
select cron.schedule('push-weekend', '*/15 * * * 5', $job$
  select net.http_post(
    url := 'https://fneiobwtubeehjqnzeta.supabase.co/functions/v1/push',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"send"}'::jsonb)
$job$);

grant select, insert, update on public.push_keys to service_role;
grant select, insert, update on public.push_subs to service_role;
grant select on public.push_subs to authenticated;
revoke truncate, references, trigger on public.push_keys from anon, authenticated;
revoke truncate, references, trigger on public.push_subs from anon, authenticated;
notify pgrst, 'reload schema';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sync_metadata',
    'positions',
    'trades',
    'stakes',
    'market_pools'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;

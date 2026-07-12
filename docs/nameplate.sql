-- ============================================================
-- THE NAMEPLATE — a claimed ticker is YOURS: one holder, ever.
-- The walk claims it live, the device wears it as its name, and
-- nobody else can take it — enforced at the database, not the
-- honor system. Safe to re-run.
-- ============================================================

-- 1 · one ticker, one member (case-blind). If duplicates already
--     exist the index politely refuses and names them instead of
--     breaking anyone — re-run after re-homing the dupes.
do $$
declare dupes text;
begin
  select string_agg(t, ', ') into dupes from (
    select upper(ticker) as t from public.providers
     where coalesce(ticker, '') <> ''
     group by upper(ticker) having count(*) > 1) x;
  if dupes is not null then
    raise notice 'duplicate tickers need re-homing first: %', dupes;
  else
    begin
      create unique index if not exists providers_ticker_one
        on public.providers (upper(ticker)) where coalesce(ticker, '') <> '';
    exception when others then raise notice 'ticker index: %', sqlerrm;
    end;
  end if;
end $$;

-- 2 · the live availability check (the walk asks before claiming)
create or replace function public.ticker_free(p_tick text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(trim(p_tick), '') <> ''
     and not exists (select 1 from providers where upper(ticker) = upper(trim(p_tick)));
$$;
grant execute on function public.ticker_free(text) to anon, authenticated;

-- self-check: expect 1 · t
select count(*) as nameplate_fn from pg_proc where proname = 'ticker_free';
select public.ticker_free('ZZZZZ') as a_free_name_reads_true;

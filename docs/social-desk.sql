-- ============================================================
-- THE SOCIAL DESK — one chart, every platform.
-- Run after handshake2.sql.
--
-- The signals table already holds one row per member, per
-- platform, per metric, per day. This paste finishes the engine:
--   1) more platforms can file (Meta products + the rest)
--   2) rows learn HOW they arrived: self = false means the
--      machine pulled them (login-verified or the sweep);
--      self = true means the member declared them (a paste or a
--      CSV export from the platform's own analytics)
--   3) file_my_signals(rows): the member's import door — capped,
--      validated, upserts by day, always stamped 'declared'.
-- Declared numbers count into the world term like everything
-- else (it's log-curved and capped at 1,000 pts), and the chart
-- draws them dotted so the floor always knows which is which.
-- Safe to re-run.
-- ============================================================

alter table public.external_signals drop constraint if exists external_signals_source_check;
alter table public.external_signals add constraint external_signals_source_check
  check (source in ('spotify','youtube','lastfm','songstats',
                    'github','twitch','reddit','x','tiktok','instagram',
                    'facebook','threads','snapchat','linkedin'));

alter table public.external_signals add column if not exists self boolean not null default false;

create or replace function public.file_my_signals(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; src text; knd text; val numeric; d date;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 400 then raise exception '400 rows per import, max'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      src := lower(coalesce(r ->> 'source', ''));
      knd := lower(regexp_replace(coalesce(r ->> 'kind', ''), '[^a-z0-9_]', '', 'g'));
      val := (r ->> 'value')::numeric;
      d := coalesce(nullif(r ->> 'at', '')::date, current_date);
      if src not in ('spotify','youtube','lastfm','songstats','github','twitch','reddit','x',
                     'tiktok','instagram','facebook','threads','snapchat','linkedin') then continue; end if;
      if char_length(knd) < 2 or char_length(knd) > 24 then continue; end if;
      if val is null or val < 0 or val > 1000000000 then continue; end if;
      if d > current_date or d < current_date - 365 then continue; end if;
      insert into external_signals (owner, source, kind, value, at, self)
      values (auth.uid(), src, knd, val, d, true)
      on conflict (owner, source, kind, at) do update
        set value = excluded.value, self = true;
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end $$;
grant execute on function public.file_my_signals(jsonb) to authenticated;

-- self-check: expect 1 · 1
select count(*) as self_col from information_schema.columns
 where table_name = 'external_signals' and column_name = 'self';
select count(*) as import_fn from pg_proc where proname = 'file_my_signals';

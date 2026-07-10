-- ============================================================
-- THE PUBLIC STATS LINE — real numbers on every ticker sheet.
--
-- board_signals(slug): the latest swept platform numbers
-- (Spotify followers, YouTube subs/views, Last.fm plays), the
-- in-app play count, and the identifier tally for one desk.
-- All of it already public data — this just serves it in one
-- call so the floor can print it under the chart. Run any time
-- after signals-schema.sql. Safe to re-run.
-- ============================================================
create or replace function public.board_signals(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid; sig jsonb := '[]'::jsonb; ids int := 0; vids int := 0; pl bigint := 0;
begin
  select owner into o from providers
   where slug = p_slug and owner is not null limit 1;
  if o is null then return null; end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
        'source', s.source, 'kind', s.kind, 'value', s.value, 'at', s.at)), '[]'::jsonb)
      into sig
      from (select distinct on (source, kind) source, kind, value, at
              from external_signals where owner = o
             order by source, kind, at desc) s;
  exception when undefined_table then null; end;

  begin
    select count(*), count(*) filter (where verified)
      into ids, vids from member_identifiers where owner = o;
  exception when undefined_table then null; end;

  begin
    select coalesce(sum(plays), 0) into pl from track_plays
     where slug in (select lower(regexp_replace(coalesce(slug,''),'[^a-zA-Z0-9]','','g'))
                      from providers where owner = o);
  exception when undefined_table then null; end;

  return jsonb_build_object('signals', sig, 'identifiers', ids, 'verified', vids, 'plays', pl);
end;
$$;
grant execute on function public.board_signals(text) to anon, authenticated;

-- self-check: expect 1
select count(*) as stats_line_ready from pg_proc where proname = 'board_signals';

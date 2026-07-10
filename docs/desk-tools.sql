-- ============================================================
-- DESK TOOLS — the eraser. Desk-only (is_mcc_admin).
-- unclaim_listing(slug): release a claim, listing stays on the floor.
-- erase_listing(slug): delete the listing row entirely.
-- Run AFTER admin-schema. Safe to re-run.
-- ============================================================
create or replace function public.unclaim_listing(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not is_mcc_admin() then raise exception 'the desk holds the eraser'; end if;
  update providers set owner = null where slug = p_slug;
  begin update providers set claimed = false where slug = p_slug; exception when undefined_column then null; end;
  return 'released — ' || p_slug || ' is unclaimed and claimable again';
end;
$$;
grant execute on function public.unclaim_listing(text) to authenticated;

create or replace function public.erase_listing(p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_mcc_admin() then raise exception 'the desk holds the eraser'; end if;
  delete from providers where slug = p_slug;
  get diagnostics n = row_count;
  return n || ' listing(s) erased: ' || p_slug;
end;
$$;
grant execute on function public.erase_listing(text) to authenticated;

select count(*) as eraser_ready from pg_proc where proname in ('unclaim_listing','erase_listing');

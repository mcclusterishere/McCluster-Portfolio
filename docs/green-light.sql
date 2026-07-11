-- ============================================================
-- THE GREEN LIGHT — Our Street runs itself; the desk watches.
-- Members make accounts, post listings, and go LIVE the moment
-- they post — no Mission Control approval in the way. The admin
-- keeps three powers instead of a gate:
--   · THE NOTICE — every go-live rings the admin's bell
--   · THE UNDO  — one button pulls a listing back (paused, with
--                 a reason the member sees)
--   · THE PEN   — one button messages the member from the desk
-- Payment approvals are untouched — money keeps its gates.
-- Safe to re-run.
-- ============================================================

-- 1 · new listings are born LIVE
alter table public.providers alter column status set default 'live';

-- 2 · owners run their own cards (the old "can't self-approve"
--     clause was the gate; the green light retires it — undo stays
--     the desk's power because a paused row can be re-lit by its
--     owner only while the desk hasn't stamped a review_note)
drop policy if exists "owners edit their own listing" on public.providers;
create policy "owners edit their own listing"
  on public.providers for update
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- 3 · open the waiting room: everyone stuck in review goes live now
update public.providers set status = 'live' where status = 'pending';

-- 4 · THE NOTICE — every go-live rings the desk's bell (rides the
--     inbox rail from docs/inbox.sql; if that paste isn't in yet,
--     the trigger stays quiet instead of blocking the member)
create or replace function public.tg_greenlight()
returns trigger language plpgsql security definer set search_path = public as $$
declare adm uuid;
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select id into adm from auth.users where email = 'matthew@mccluster.org' limit 1;
    if adm is not null and adm <> new.owner then
      begin
        perform public.notify(adm, 'greenlight',
          '🟢 ' || coalesce(new.name, 'A new member') || ' went live on Our Street',
          'Self-served, no gate. Undo it or message them from Mission Control → Listings.',
          'mission.html');
      exception when others then null;
      end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists greenlight_ins_t on public.providers;
create trigger greenlight_ins_t after insert on public.providers
  for each row execute function public.tg_greenlight();
drop trigger if exists greenlight_upd_t on public.providers;
create trigger greenlight_upd_t after update on public.providers
  for each row execute function public.tg_greenlight();

-- 5 · THE PEN — the desk messages any member about what they did;
--     it lands on their bell and their desk
create or replace function public.admin_note_member(p_owner uuid, p_msg text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select email from auth.users where id = auth.uid()), '') <> 'matthew@mccluster.org' then
    return jsonb_build_object('ok', false, 'why', 'the pen is the desk''s');
  end if;
  if p_owner is null or coalesce(trim(p_msg), '') = '' then
    return jsonb_build_object('ok', false, 'why', 'a real note');
  end if;
  perform public.notify(p_owner, 'desk', '✉️ A note from the desk',
    left(trim(p_msg), 800), 'mymission.html');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_note_member(uuid, text) from public;
grant execute on function public.admin_note_member(uuid, text) to authenticated;

-- self-check: expect 'live' · 2 · 1
select column_default as listing_default from information_schema.columns
 where table_name = 'providers' and column_name = 'status';
select count(*) as greenlight_triggers from pg_trigger where tgname like 'greenlight%';
select count(*) as pen from pg_proc where proname = 'admin_note_member';

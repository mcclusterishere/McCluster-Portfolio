-- ============================================================
-- THE INBOX — one bell for everything that happens to you.
-- A notifications table only the system writes: deals landing,
-- status moves, money arriving, your listing going live, your
-- own saves (so "did it save?" never happens again). Members
-- read their own bell and mark it seen; kinds are free-form so
-- visits, crews and playlists join later without a migration.
-- Run after collab-schema + equity-schema. Safe to re-run.
-- ============================================================

create table if not exists public.notifications (
  id    uuid primary key default gen_random_uuid(),
  owner uuid not null,
  kind  text not null check (char_length(kind) between 2 and 32),
  title text not null,
  body  text,
  link  text,
  read  boolean not null default false,
  at    timestamptz not null default now()
);
create index if not exists notifications_owner_at on public.notifications (owner, at desc);
alter table public.notifications enable row level security;
drop policy if exists "own bell read" on public.notifications;
create policy "own bell read" on public.notifications for select using (owner = auth.uid());
-- no insert/update policies for members: the system files, my RPCs mark seen

-- the one writer every trigger uses — never throws, never blocks the real work
create or replace function public.notify(p_owner uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_owner is null then return; end if;
  insert into notifications (owner, kind, title, body, link)
  values (p_owner, p_kind, p_title, left(coalesce(p_body, ''), 300), p_link);
exception when others then null;
end $$;

-- a new deal lands on the payee's desk
create or replace function public.tg_notify_deal_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  begin
    select owner into o from providers where slug = new.to_slug limit 1;
    if o is distinct from new.from_owner then
      perform notify(o, 'deal', 'New deal on your desk',
        coalesce(new.from_name, 'Someone') || ' sent "' || new.title || '" — open it and answer.',
        'market.html#yours');
    end if;
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists notify_deal_insert on public.deals;
create trigger notify_deal_insert after insert on public.deals
  for each row execute function public.tg_notify_deal_insert();

-- a status move rings the OTHER side's bell (never your own echo)
create or replace function public.tg_notify_deal_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  begin
    if new.status is distinct from old.status then
      select owner into o from providers where slug = new.to_slug limit 1;
      if o is not null and o is distinct from auth.uid() then
        perform notify(o, 'deal', 'Deal ' || new.status,
          '"' || new.title || '" moved to ' || new.status || '.', 'market.html#yours');
      end if;
      if new.from_owner is distinct from auth.uid() then
        perform notify(new.from_owner, 'deal', 'Deal ' || new.status,
          '"' || new.title || '" moved to ' || new.status || '.', 'market.html#yours');
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists notify_deal_status on public.deals;
create trigger notify_deal_status after update on public.deals
  for each row execute function public.tg_notify_deal_status();

-- money landed — the bell every member wants to hear
create or replace function public.tg_notify_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare o uuid; t text;
begin
  begin
    select p.owner, d.title into o, t
      from deals d join providers p on p.slug = d.to_slug
     where d.id = new.deal_id limit 1;
    perform notify(o, 'paid', 'You got paid',
      '"' || coalesce(t, 'A deal') || '" — $' || new.gross || ' verified on the record.',
      'market.html#yours');
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists notify_paid on public.deal_payments;
create trigger notify_paid after insert on public.deal_payments
  for each row execute function public.tg_notify_paid();

-- the listing's whole life: saved → in review → live / needs a fix
create or replace function public.tg_notify_listing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform notify(new.owner, 'listing', 'Listing saved — it''s in review',
        'Your card is on the review desk. The moment it goes live, this bell rings.',
        'market.html#yours');
    elsif new.status is distinct from old.status and new.status = 'live' then
      perform notify(new.owner, 'listing', 'Your listing is LIVE',
        'You''re on the floor — your ticker prints from here.',
        'market.html?to=' || coalesce(new.ticker, new.slug));
    elsif new.status is distinct from old.status and coalesce(new.review_note, '') <> '' then
      perform notify(new.owner, 'listing', 'From the review desk',
        new.review_note, 'market.html#yours');
    elsif new.owner = auth.uid() then
      perform notify(new.owner, 'listing', 'Listing saved',
        'Your changes are banked.', 'market.html#yours');
    end if;
  exception when others then null; end;
  return new;
end $$;
drop trigger if exists notify_listing on public.providers;
create trigger notify_listing after insert or update on public.providers
  for each row execute function public.tg_notify_listing();

-- my bell, newest first
create or replace function public.my_inbox(p_limit int default 30)
returns table (id uuid, kind text, title text, body text, link text, read boolean, at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, kind, title, body, link, read, at
    from notifications where owner = auth.uid()
   order by at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
grant execute on function public.my_inbox(int) to authenticated;

-- opening the bell marks it seen; returns how many were new
create or replace function public.inbox_seen()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read = true where owner = auth.uid() and not read;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.inbox_seen() to authenticated;

-- self-check: expect 1 table · 7 functions
select count(*) as bell_tbl from information_schema.tables where table_name = 'notifications';
select count(*) as bell_fns from pg_proc
 where proname in ('notify', 'tg_notify_deal_insert', 'tg_notify_deal_status',
                   'tg_notify_paid', 'tg_notify_listing', 'my_inbox', 'inbox_seen');

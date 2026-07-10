-- THE GUIDE'S MEMORY — one thread per member with the in-game concierge.
-- Members read only their own thread (the widget restores it on open);
-- nothing writes here except the-guide function on the service key, so
-- the record can't be forged from a browser. The desk reads the room.

create table if not exists public.guide_chats (
  id    uuid primary key default gen_random_uuid(),
  at    timestamptz default now(),
  owner uuid not null,
  role  text not null check (role in ('user', 'guide')),
  body  text not null check (char_length(body) between 1 and 4000)
);
create index if not exists guide_chats_owner_at on public.guide_chats (owner, at desc);

alter table public.guide_chats enable row level security;

drop policy if exists "your thread is yours" on public.guide_chats;
create policy "your thread is yours"
  on public.guide_chats for select
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'matthew@mccluster.org');

-- no insert/update/delete policies on purpose:
-- only the-guide function (service key) writes the record.

-- self-check: expect 1
select count(*) as guide_ready from information_schema.tables where table_name = 'guide_chats';

-- ============================================================
-- MESSAGES — visitor communication, both ways.
-- One thread per deal: the client and the operator talk inside
-- the record they're already signing. RLS: only the two parties
-- to the deal can read or write its thread.
-- Paste into Supabase → SQL editor → Run. Safe to re-run.
-- ============================================================

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  from_owner uuid not null,
  from_name text default '',
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz default now()
);

create index if not exists messages_deal_idx on messages (deal_id, created_at);

alter table messages enable row level security;

drop policy if exists "participants read the thread" on messages;
create policy "participants read the thread"
  on messages for select using (
    exists (
      select 1 from deals d where d.id = messages.deal_id
        and (d.from_owner = auth.uid()
             or exists (select 1 from providers p where p.slug = d.to_slug and p.owner = auth.uid()))
    )
  );

drop policy if exists "participants write the thread" on messages;
create policy "participants write the thread"
  on messages for insert with check (
    from_owner = auth.uid()
    and exists (
      select 1 from deals d where d.id = messages.deal_id
        and (d.from_owner = auth.uid()
             or exists (select 1 from providers p where p.slug = d.to_slug and p.owner = auth.uid()))
    )
  );

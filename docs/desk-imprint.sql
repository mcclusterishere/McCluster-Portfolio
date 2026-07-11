-- ============================================================
-- THE IMPRINT — what you claim about yourself STAYS claimed.
-- The member desk remembers your face (which "you" runs the
-- room) and your paths (the card lanes from RISE) on the
-- ACCOUNT, not the device: any phone, any browser, any pass,
-- the desk opens already sorted to you. Different accounts on
-- the same device never bleed into each other — the account is
-- the key. Run after visit-pings.sql (member_prefs exists).
-- Safe to re-run.
-- ============================================================

alter table public.member_prefs add column if not exists face text;
alter table public.member_prefs add column if not exists paths text[];

create or replace function public.imprint_desk(p_face text, p_paths text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f text;
  ps text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'why', 'signed out');
  end if;
  f := nullif(btrim(coalesce(p_face, '')), '');
  if f is not null and f !~ '^[A-Za-z][A-Za-z0-9 /&+.-]{0,23}$' then
    return jsonb_build_object('ok', false, 'why', 'that face reads wrong');
  end if;
  select array_agg(distinct t) into ps
    from unnest(coalesce(p_paths, '{}')) t
   where t in ('signal', 'infra', 'capital', 'culture', 'justice', 'access', 'proof', 'command');
  -- null means "leave what's imprinted" — face and paths write independently
  insert into member_prefs (owner, face, paths)
  values (auth.uid(), f, ps)
  on conflict (owner) do update
    set face  = coalesce(excluded.face,  member_prefs.face),
        paths = coalesce(excluded.paths, member_prefs.paths);
  return (select jsonb_build_object('ok', true, 'face', face,
                                    'paths', to_jsonb(coalesce(paths, '{}'::text[])))
            from member_prefs where owner = auth.uid());
end $$;
revoke all on function public.imprint_desk(text, text[]) from public;
grant execute on function public.imprint_desk(text, text[]) to authenticated;

create or replace function public.my_imprint()
returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(
    (select jsonb_build_object('face', face,
                               'paths', to_jsonb(coalesce(paths, '{}'::text[])))
       from member_prefs where owner = auth.uid()),
    '{}'::jsonb);
$$;
revoke all on function public.my_imprint() from public;
grant execute on function public.my_imprint() to authenticated;

-- self-check: expect 2
select count(*) as imprint_fns from pg_proc where proname in ('imprint_desk', 'my_imprint');

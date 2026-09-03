# RETIRED — do not write to this repository

`mcclusterishere/McCluster-Portfolio` is **retired**. It is kept for its
history and nothing else.

- It publishes nothing. Every workflow is manual-only, and `deploy-pages.yml`
  refuses on purpose.
- It is connected to no Worker, no database and no live domain.
- Editing anything here changes nothing a person can see.

## Where the work goes

| | |
| --- | --- |
| Live site | `mcclusterishere/mccluster` → matthew.mccluster.org, mccluster.org |
| API Worker | `mccluster` → api.mccluster.org |
| Database | Supabase `zmnhbrjyhxzhkxmhkexs` |

## If you are an agent

**Do not edit, commit, push, refactor, clean up, migrate or deploy anything
here.** Reading is fine.

A general request about McCluster, the portfolio, the website or the backend
is **not** permission to write here — it almost certainly means
`mcclusterishere/mccluster`.

And if the instruction does name this repository: still stop and say so in
the chat first.

> You are asking me to write to `mcclusterishere/McCluster-Portfolio`, which
> is retired and publishes nothing. Did you mean `mcclusterishere/mccluster`?

Then wait for the answer. An agent has already burned a session's worth of
tokens editing a retired repository while the live site sat untouched.

## Never draw a logo

The artwork the owner supplies is the only source of truth for any mark,
forever. Do not trace, approximate, reconstruct, recolour or composite one.
Cropping a supplied file is fine; adding a shape it does not contain is
drawing. If the variant you need does not exist, ask.
---

# Claude / Codex / Cursor — stop

You are in the McCluster ecosystem.

1. Read `AGENTS.md` completely before any edit.
2. Read `docs/control-plane/ECOSYSTEM.md` if this is the control repo (`mcclusterishere/mccluster`).
3. **McCluster is the backend and the control plane.** GitHub `mcclusterishere/mccluster` + Cloudflare project `mccluster` + Supabase `zmnhbrjyhxzhkxmhkexs`.
4. This repo is either the plane or a satellite. Satellites do not grow a second auth, database, social, billing, or admin stack.
5. Do not auto-push GitHub Actions onto feature branches.
6. Do not rewrite `index.html` or revive rejected visual systems.
7. If you were about to create a new backend: stop. Put it on McCluster.

Public edge: `https://matthew.mccluster.org` (apex `mccluster.org` is the same property). Worker API: `mccluster-core` on `api.mccluster.org`.
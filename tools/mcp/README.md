# The M Network MCP server

Talk to the network through Claude instead of clicking through anyone's system.
This is a dependency-free MCP server (stdio, JSON-RPC) that exposes the
network's Supabase backend as tools: list the live providers, file booking
requests, work the inbox, count the text list.

## Hook it into Claude Code

```bash
claude mcp add mcc-network -- node tools/mcp/server.mjs
```

Then just talk: *"Who's on the network for video?"* → `list_providers`.
*"Book McCluster for a shoot Saturday, I'm Dana, dana@x.com"* → `request_booking`.

## Access levels

| Env var | Who | Unlocks |
|---|---|---|
| *(none)* | anyone | `list_providers`, `request_booking` — same walls as the public site (RLS) |
| `SUPABASE_TOKEN` | a signed-in provider's access token | their own inbox: `list_booking_requests`, `set_booking_status` |
| `SUPABASE_SERVICE_KEY` | the owner only — **never commit it, never put it in the site** | everything, plus `sms_list_size` |

The anon key baked into the server is the same public one the site ships —
Row Level Security in `docs/network-schema.sql` is the wall.

## Before first use

1. Run `docs/network-schema.sql` in the Supabase SQL editor (after
   `docs/platform-schema.sql`).
2. In Supabase → Authentication → URL Configuration, add the site's pages to
   the redirect allow-list so Talent App magic links land back on
   `talent.html`.

## What this replaces

Square stays as the *payment rail* (its links still work everywhere on the
site), but scheduling, the provider directory, and the booking inbox are ours:
the site writes to the same tables this server reads, so a booking filed by a
visitor, by Claude, or by hand all land in the one inbox the Talent App works.

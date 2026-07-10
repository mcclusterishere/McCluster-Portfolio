# THE AI DESK CHARTER — what Claude can and cannot do here

The platform runs two Claude-powered organs plus a scanner. This is the
carve-out: the constitution every AI seat operates under. It is enforced
three ways — by the system prompts (the AI is told), by the edge
functions (the AI is only *given* certain powers), and by the database
(RLS + security-definer functions refuse what the AI must never do,
even if it asked).

## The seats

| Seat | Function | Who talks to it | Model |
|---|---|---|---|
| **The Guide** | `the-guide` | every signed-in member (40/day cap) | Haiku — the economy seat |
| **The Brain** | `the-brain` | the desk only | Fable — the frontier seat |
| **The Scanner** | `scan-proof` | members via missions | Haiku |

## What the AI CAN do

- **The Guide**: answer members' questions about the platform in
  character; read the caller's OWN card (name, ticker, status, hustles)
  and the caller's OWN chat thread; point to real tabs by name.
- **The Brain**: read aggregate platform telemetry (counts by status,
  event tallies, nightly snapshots — no message bodies, no private
  member data); file upgrade PITCHES into `brain_pitches` for the desk
  to read; ground every pitch in the numbers it saw.
- **The Scanner**: look at ONE uploaded proof image and say whether it
  plausibly shows the claimed mission done.
- **Drafting** (all seats): words, summaries, recommendations —
  anything a human reviews before it takes effect.

## What the AI CANNOT do — ever

1. **Move money.** No seat can mint, transfer, spend, or cash out E⤴.
   The mint paths (`mint_on_completion`, gauntlet, claim run) check
   `auth.uid()` and webhook-written `deal_payments` — an AI has neither.
2. **Verify identity or award seals.** `award_badge` requires
   `is_mcc_admin()` — a human desk session. The AI may RECOMMEND a
   verification; the stamp is human, always.
3. **Approve cash-outs.** Desk-only, human-only, by design.
4. **See other members' private data.** The Guide is scoped to the
   caller by the function itself; it is never handed anyone else's
   rows. The Brain sees aggregates, not people.
5. **Change the system.** No seat holds a key that can write schema,
   policies, or code. Pitches are filed as text; a human ships or
   doesn't.
6. **Speak AS the platform to the outside.** No AI seat posts publicly,
   emails members, or answers on the record. It advises the desk; the
   desk speaks.

## The line, in one sentence

**The AI reads, reasons, and recommends; the human moves money, stamps
identity, and speaks.**

## Why it's enforceable, not aspirational

The carve-out doesn't depend on the model behaving. The Guide's
function only SELECTs the caller's own rows. The Brain's function only
INSERTs into `brain_pitches`. Neither holds a code path that touches
`mtoken_ledger` writes, `member_badges` verification, or cash-outs —
and the database refuses those operations without a human session
(`auth.uid()` + `is_mcc_admin()`). To give the AI a new power, a human
has to ship new code and new SQL on purpose.

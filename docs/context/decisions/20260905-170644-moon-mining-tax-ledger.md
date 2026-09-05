# Scope decisions — moon mining tax ledger (issue #523)

_Recorded 2026-09-05 · issue #523._

- **Built entirely on `GET /characters/{character_id}/mining/` (own-character
  token, `esi-industry.read_character_mining.v1`), not the corp observer
  endpoint.** The renter mines moons owned by _other_ corporations, and the
  only ESI path that resolves mining down to a specific moon/structure
  (`GET /corporation/{corporation_id}/mining/observers/{observer_id}/`)
  requires the Accountant role **in the moon-owning corp** — never available
  to a renter. Confirmed against the official ESI blog
  (developers.eveonline.com/blog/mining-ledgers-in-esi) and cross-checked
  against how `aa-miningtaxes` (the one prior art built for exactly this
  problem) actually gets moon-level data: only by having the moon-owning
  corp's own leadership configure an Accountant-role token centrally — not
  something a renter can set up for someone else's corp.
- **Granularity ceiling is (character, EVE/UTC date, solar system) — not
  moon, not timestamp.** ESI pre-aggregates the personal ledger to one row
  per that triple before it ever reaches the app; there is no intra-day
  timestamp to recover a finer session boundary from. Two consequences taken
  as given, not solved: (a) "was mining interrupted by ice/belt ore" is a
  non-question — different `type_id`s already land in separate rows, so
  filtering to a moon-goo allowlist isolates moon mining with zero
  interruption-detection logic; (b) two different corps' moons rented in the
  same system on the same day cannot be told apart by ESI at all. Accepted as
  a permanent limitation, mitigated (not solved) by letting one derived entry
  split across two Payees.
- **Payee carries an optional moon/system tag, used to auto-match and
  pre-fill future entries.** This is the mitigation for "ESI can't name the
  moon" — the human already knows which moon they were at; encoding that
  once onto the Payee (tag it by moon, corp, or person — whichever is
  actually memorable) turns most future assignments into a one-click confirm
  instead of a blind pick. Deliberately left unmatched for the
  multiple-moons-one-system case above — that's the one case nothing can
  auto-resolve, and it's exactly where the split-payee flow is needed anyway.
- **Assignment snapshots tax % and ISK value at assignment time (invoice
  semantics), and is re-diffed against fresh ledger pulls indefinitely, not
  just once.** Two failure modes this is built to avoid, both surfaced by an
  adversarial design review before this was built: (1) editing a Payee's
  default % later, or Jita prices moving, must not retroactively change what
  an already-assigned obligation shows as owed; (2) ESI's own ledger can
  report _more_ ore for an already-assigned key after the fact (routine for
  same-day or previous-day entries, not an edge case) — silently absorbing
  that drift would under-tax by the delta with zero visibility. An assignment
  whose underlying entry grew after assignment flips to `needs-review` with
  an explicit before/after quantity diff instead.
- **"Mark as paid" defaults to happening in the same action as "assign,"
  not a separate later step.** The user's own workflow: they pick a
  payee/rate and pay in-game right after, in one sitting. The Assign dialog's
  "I already sent this in-game" checkbox defaults on; unchecking it is the
  only way to leave something Outstanding for later. Bulk-paying several
  Outstanding rows at once still requires an itemized confirmation
  (payee/character/date range/total) before committing — no single blind
  "mark all paid" click, since a wrong bulk action here is an unrecoverable
  false statement about a real-world debt.
- **One continuously-filterable list, not a tabbed To-Assign/Outstanding/Paid
  split.** First draft used three tabs; rejected on user feedback as "too
  many tabs" fighting against "I want to see everything." Replaced with two
  multi-selects (Characters, defaulting to all; Status, defaulting to
  everything **except** Paid) plus clickable stat-chip counters as filter
  shortcuts — same data, one page, no navigation between views to reconcile
  a single day's work.
- **Default character scope is every tracked character, not the app's usual
  single-active-character default.** Deliberate deviation from the rest of
  the app: the entire point of this feature is not forgetting an alt's
  obligation, and defaulting to "whichever character happens to be active"
  directly undermines that.
- **An unrecognized ledger `type_id` surfaces as an explicit "unclassified
  ore" banner with a manual tag action, never silently dropped.** The
  moon-goo allowlist is maintenance-dependent (CCP has changed moon
  materials before); a stale list must fail loud, not make obligations
  vanish invisibly.
- **Mockup**: interactive HTML prototype built against the shipping design
  system (Panel/PageHeader/Tabs-less-list/StatChip/Modal, verified against
  both `docs/DESIGN.md` and the live app's own computed styles at
  `localhost:5173` — real `max-w-6xl`/`p-4` container, real text-only bottom
  nav classes) — ask in chat for the current link if picking this up later;
  not persisted to the repo since it's a design reference, not shipped code.

# Scope decisions — Needs-review: split from it, auto-absorb unpaid growth

_Recorded 2026-09-26._

- **A `needs-review` Assignment can be split, against the entry's fresh
  totals.** The growth is usually exactly the ore a pilot wants to hand to a
  second Payee (two corps' moons, one system, one day), and "Accept New
  Total" only ever puts it on the existing Payee. The Split dialog is offered
  on needs-review rows and is fed the ore the Assignment now owns
  (`linesOwnedBy`), not its stale snapshot. The kept side re-opens as
  Outstanding with the diff and any `paidAt` cleared — the same outcome as
  accepting the growth, so it never under-counts.
- **Growth on an Outstanding, ungrouped Assignment is absorbed at once
  instead of flagged.** An unsettled obligation has no paid history for
  needs-review to protect; the flag only added a click. `reconcileAssignments`
  calls `resolveNeedsReview` for these (re-snapshot, re-price at the Payee's
  hub, stay Outstanding), and falls back to flagging if that fails. Paid,
  dismissed and joined-group (`groupId`) Assignments still flip to
  `needs-review`: a paid one would otherwise silently re-open, a dismissed one
  would silently start owing, and a group's shared terms are not ours to
  re-price per member. Rows already `needs-review` before this change stay so
  until the pilot resolves them. Supersedes the "flips to needs-review" rule
  in `20260905-170644-moon-mining-tax-ledger.md` for the Outstanding case only.

# 0024 — A paid mining tax Assignment stays paid when its ore grows

## Status

Accepted (2026-10-18)

## Context

ESI's Mining Ledger Entry for a day keeps growing while that day is mined,
and the ledger lags real time on top of its cache. `reconcileAssignments`
(`src/features/miningTax/reconcile.ts`) re-diffs every stored Assignment
against the fresh ledger. Unpaid growth is absorbed into the Assignment
(`planNeedsReviewResolution`, `assignments.ts`); paid and dismissed growth
flips the Assignment to `needs-review`, so a pilot who already paid sees a
settled day reopen.

The **Corp Tax Book** (ADR 0023, epic #4055) makes this worse. Its rule is
forward-only: an issued **Statement** never changes, and late ore on a paid
Statement's days is written off, never billed. If the personal tab reopens a
paid day the corp has closed, a corp member and their corp disagree about whether
anything is owed, which the book's forward-only rule exists to prevent.

## Decision

**Paid stays paid in the personal tab, for every pilot, whether or not their
corp runs a Corp Tax Book.** Growth on a paid Assignment never changes that
Assignment's status, `oreLines` or tax. The extra ore becomes a new,
separately assignable entry for the same day and system, as if it were mined
after payment.

Unpaid growth is still absorbed as today. Dismissed growth keeps its current
behaviour; this decision is about paid Assignments only.

## Consequences

- A pilot's paid days never reopen. The record of what they paid, and the
  value and rate it was paid at, stays exactly as it was.
- Late ore after payment is visible as its own row rather than as a diff on
  the paid one, so the pilot decides whether it is owed, to whom, and pays
  it separately. Against a Corp Tax Book, that row follows the book's rule:
  if the book closed the day, it is "Recorded after payment — written off".
- `reconcile.ts` changes (#4060) and its "paid growth flags" tests invert.
  The rule "never silently absorbed into `oreLines`"
  (`20260905-180422-moon-mining-tax-v1-implementation-choices.md`) still holds:
  nothing is absorbed, the growth is split off.

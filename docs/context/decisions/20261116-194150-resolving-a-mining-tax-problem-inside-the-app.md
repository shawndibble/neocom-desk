# Scope decisions — Resolving a mining-tax problem inside the app

_Recorded 2026-11-16._ Mockups: `docs/design/mockups/mining-tax-resolve/`.

- **Every problem the Tax tab reports has five possible outcomes, split by who has to
  agree.** Settle it yourself: pay it, fix my records, not paying. Ask the corporation: I
  already paid, I don't owe this. Only the ones that apply are offered, self-service first.
  This rules out any warning that ends in "ask an officer" with no control beside it.

- **One Resolve dialog per problem (mockup B), not an inline button and menu (A).** The
  dialog says what each outcome does, which is what keeps "Not paying" honest. The likeliest
  outcome is preselected. A problem with a single sensible outcome (a duplicate Assignment)
  gets that action as its button and no dialog.

- **Two member records, matching the two things a member can assert, extended in place.**
  "I don't owe this" (a payee, quantity or rate disagreement) and "I'm not paying, here's
  why" are one per Miner and day: the existing `disputes` record gains a `kind` and a
  `reason`, absent `kind` meaning the original payee dispute. The officer's two answers are
  the same for all of them: waive it, or keep the bill. "I already paid" stays a
  `declarations` record and gains its evidence (amounts, times, journal refs, who received
  it) and what the wallet check found. Firestore changes are additive only (dev and
  production share one project). This rules out a third collection and a migration.

- **Keeping a bill requires a next step.** An officer who rejects a dispute or a declaration
  must say what the member should do next; the member reads it word for word beside the bill,
  with Resolve again.

- **An open dispute holds its day, for at most 14 days.** While held, payments skip the
  disputed amount (money passes over it to the next unpaid day; the held amount stays open separately)
  and a Conflict day does not resolve to the corporation. Unanswered after 14 days, the hold
  lapses and the amount is owed as before — the Overdue flow's pause budget, reused. This
  rules out an unbounded pause that lets a dispute stall a bill.

- **A Corp Tax Book is paid by amount, never by day.** The book pays a Miner's oldest days
  first and cannot target a moon or a day, so in-flight donations follow the same rule,
  skipping held days, and the pay dialog shows where a payment lands. Picking specific entries
  stays for personal Payees, where it is real. The member's own marks are the exception: a mark
  pays the day it names on their tab (their side is done), only money beyond the marked days
  pays other open days oldest first, a payment is only ever recorded or linked against the days
  its amount covers, and once the book holds a marked payment but spent it on older days, the
  row says so and offers Resolve.

- **"Not paying" is the member's own, on their device, and never reads as resolved.** One
  click, no reason, nothing sent; the row reads "Not paying — {corp} still bills this" and is
  listed under Hidden. Telling the corporation why is optional and is a `notPaying` dispute.

- **An "I already paid" is checked before any officer sees it.** Against what the book has
  synced of the corporation's wallet (every division): one exact match (sender, amount, not
  already credited) is credited at once; a match in a division the book does not read, no
  match, or a claim older than the wallet history the book holds each reach the officer
  labelled as such. "Too old to check" is never reported as "not found".

- **ISK paid to a person is confirmed in that person's own wallet, on their own device.**
  Personal wallet tokens never leave the device (CLAUDE.md), so the server cannot check; the
  recipient's app does when they open Needs you, and offers "Record it as tax".

- **Who answers members' tax questions is a book setting.** The CEO by default, a mailing
  list (a member who is not on it mails the CEO instead, since EVE only delivers to a list
  from its members), or up to five named officers. Any officer who can edit the book may
  change it. Needs you always gets the question; the EVE mail is for officers not in the app.

- **A corporation the member has left gets one notice and can be hidden.** Detected from the
  Character's current corporation. The book's debt is shown, never hidden silently.

# Scope decisions — Order detail modal leads with the call and one next step; sections fold (issue #1428)

_Recorded 2026-09-24 · issue #1428._

- **Which sections fold, and by default.** "Who is cheaper, and where", the
  cost-basis ledger (only once a cost basis exists — see below) and "Is there
  a better exit?" each start folded behind a `Disclosure`, at every width.
  "The numbers" (the stat grid plus the past-expiry line) is the one
  exception: it stays open on desktop and only folds on a phone
  (`useIsPhone`), per the ticket's own resolved fork. This is why the stat
  chip and rank tests needed no `expandAll()` change even though the ticket's
  implementation-plan prose said they would — that prose predates the fork's
  resolution to a hybrid (fold-everywhere except this one section), and the
  hybrid answer is the one actually shipped.
- **`matchThem`'s Next-step price reuses `orderVerdict`'s own price, not the
  raw rival price.** The ticket's Agent Brief said to use "the summary's
  `rivalPrice`" and explicitly warned against "inventing a 0.01 undercut" —
  but that text was written before issue #1421 landed the legal-tick pricing
  model. Today, `orderVerdict`'s `matchThem` price (and the verdict sentence
  built from it) is already `undercutPrice(rivalPrice)` — one legal tick
  under, never a tie. Using the raw rival price for the Next step would make
  the headline disagree with the verdict sentence directly above it, which is
  the exact failure the ticket's own stated goal ("the headline and the
  verdict sentence cannot disagree") rules out. `orderNextAction` therefore
  returns `verdict.price` for both `raisePrice` and `matchThem`, guaranteeing
  they can never diverge — there is nothing left to keep in sync.
- **The planned `nextMatchAt` ("Match at {{price}}") key was dropped.**
  "Match" implies a tie, which is no longer what this action does (see
  above); keeping that wording would have shipped a false claim next to a
  tick-under price. `raisePrice` and `matchThem` now share one key,
  `nextSetPrice` ("Set your price to {{price}}") — the actual instruction is
  identical for both: type this exact number into the order. The `kind`
  distinction between them still matters for the verdict sentence's own
  wording (why), just not for the Next step's (what to type).
- **A known undercut with no Order Floor still states the cheapest rival as a
  fact (`cheapestRival`), never as advice to match it** — the ticket's owner
  decisions added this after the original acceptance criteria was written
  ("With no Order Floor, the Next step... no price is invented"); the fork
  resolution supersedes that older bullet for this one case. `nextCheapestRival`
  ("Cheapest seller: {{price}}") carries a price with no copy affordance,
  since it is stated as information, not instructed as an action.
- **The no-cost-basis card is left exactly as it was, not converted into a
  pre-expanded `Disclosure`.** The owner decision says it "stays unfolded"
  (honouring `20260914-170542`); the simplest way to guarantee that behaviour
  never regresses is to not make it foldable at all, rather than trust a
  `Disclosure` to default open and never let it collapse. Only the non-null
  cost-basis branch is a real, collapsible `Disclosure`, with its own
  trailing (`{{unitCost}} ISK/unit`, worded to avoid an exact-string
  collision with the ledger's own "600.00 ISK" row once expanded).
- **The "Never sell below" figure moved out of the stat grid into the Quick
  answer block, not duplicated in both places.** It is now plain text (no
  copy icon) there; the Next step line already carries the copy affordance
  for `raisePrice`, which is the one case where this exact number is also the
  price to type.
- **The exits section's trailing read never repeats an exit row's own
  sentence.** Each exit kind gets a short label (`exitShortHold`,
  `exitShortUndercutStation`, `exitShortDumpToBuyOrder`, `exitShortReprocess`)
  composed with the net, e.g. "Hold · +30.00" — distinct from the row's own
  "Hold at 500.00" / "+30.00 / unit" text so the always-visible trailing and
  the row it summarises never collide as duplicate exact strings once
  expanded.
- **The detail modal is now keyed by `orderId` in `OpenOrdersPanel`.** Its
  folded-section state (`useState<Set<SectionId>>`) is internal and must
  reset between orders; without a `key`, React would reuse the same
  component instance across rows and carry stale expanded/collapsed state
  from whichever order was viewed previously.

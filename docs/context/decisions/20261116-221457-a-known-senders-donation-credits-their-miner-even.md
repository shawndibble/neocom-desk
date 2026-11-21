# Scope decisions — A known sender's donation credits their Miner even when they owe nothing (issue #6300)

_Recorded 2026-11-16 · issue #6300._

- **A donation from a character a Corp Tax Book knows (grouped into a Miner, or seen mining at its refineries) credits that Miner at once, whether or not they owe.** This reverses #6207's "held for review, may be a buyback" rule. Holding left many cards Unmatched where the officer only re-picked the same Miner. Money beyond what a Miner owes becomes credit ("Overpaying or prepaying becomes credit"); an officer can still mark it "not tax", which reflows the credit. Unknown senders stay Unmatched. Donations already held (`reviewReason: 'no-open-balance'`) are assigned by the next sync; the field is legacy and no longer written. Late notices keep their numbers.

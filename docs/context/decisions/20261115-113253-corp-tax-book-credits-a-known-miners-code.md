# Scope decisions — Corp Tax Book credits a known miner's code-less donation only while the Miner owes (issue #6207)

_Recorded 2026-11-15 · issue #6207._

- **A donation with no pay code from a known character credits their Miner only while that Miner owes.** A Miner owes when either of these holds:
  - **Unpaid days.** A closed day on their Running account is still unpaid after payments, dismissals and write-offs.
  - **Ore not yet billed.** The book has ore the Miner mined on a day that has not closed yet, or that their account has not billed yet. Both are mirrored on the server.

  The second case is there because miners often pay on the day they mine, before the day is billed. Any such ore is enough; it is not valued. Whatever a donation pays beyond what is owed stays as the Miner's credit, as before.

  This supersedes the "Automatic credit (D5/D15)" rule in `20261018-134402`, under which every donation from a Miner's characters was credited, so a buyback or SRP payment hid the next debt. A pay code still credits a donation to its Miner from anyone, whatever the Miner owes.

- **A Miner with neither has their donation held for review.** It stays Unmatched for an officer, marked `reviewReason: 'no-open-balance'` on the payment doc, and its card says why. No later sync re-matches it, even once the Miner owes, and the player cannot claim it, since it may not be tax at all. The officer assigns it or marks it not tax as usual, and assigning it clears the mark. The field is additive: older payment docs lack it and behave as before.
- **Within one sync, donations spend what is owed oldest first.** If a Miner has no ore not yet billed, two code-less donations that together pay more than is owed credit the first and hold the second. A Miner who has ore not yet billed is credited every time. Re-matching an older Unmatched donation (a sender who has since joined a Miner) follows the same rule.
- **"Ore not yet billed" ignores rates and dismissals.** A day dismissed or charged at a zero rate still counts. This is an accepted approximation: valuing the ore would need the day charges, which the sync does not compute.

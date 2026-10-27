# Scope decisions — Fleet Payouts: boss-owned, pilots from a pasted fleet list (issue #4779)

_Recorded 2026-10-23 · issue #4779. ADR 0021 stands._

- **The Community tab is "Payouts"; the glossary terms are Fleet Payout and Fleet Share.** The bare word **Payout** already means ISK a Collector sent a Feeder, so code, collections and callables all say `fleetPayout`. The tab label stays "Payouts" for players.
- **Only the boss must be a Member.** A Fleet Payout is opened by one Member and owned by them. Pilots come from a pasted fleet list (EVE's fleet copy is name-per-line text like Local), checked with ESI `POST /universe/ids` (public, no login). A pilot who is a Member links to that Member; any other pilot is a typed name with no account. Players never have to join for the boss to split their fleet. Answers the ticket's "typed name for a non-Member" question: yes.
- **Only the owner marks a Share paid.** The Community admin may remove any Fleet Payout (like Requests), never mark one paid. The boss marks paid by hand; matching a wallet journal donation is out of scope for this ticket.
- **A Member reads only their own Share.** Fleet Payout documents are readable by Members; the `shares` subcollection is readable by the owner, and by a Member only for the line carrying their own `memberUid`. Typed-name pilots are visible to the boss alone.
- **Owner-written through callables, the Requests pattern.** `communities/{id}/fleetPayouts/{payoutId}` with a `shares` subcollection; clients never write. Callables hold the caps (250 pilots, 20 open per Member, hold-back 0 to 50%, sum of Shares at most the pile less the hold-back). Additive, backward-compatible with the shared Firebase project.
- **Hold-back defaults to 10%.** Forum practice is 10 to 25%; the boss can type 0 to 50. Leftover ISK from rounding down stays unallocated.
- **Expiry is 30 days, plus the Requests 7-day grace, swept by the daily job.** A Member who leaves or is removed has their own Fleet Payouts deleted with them; Payouts they were only listed on stay, readable by the boss.
- **No mockup round.** The ticket asked for mockups first; the owner chose to build straight from the written flow (paste fleet, paste loot, review and untick, split). The UI composes existing primitives, so a later redesign is a small change.
- **Alerts (`payoutPosted`, `payoutPaid`) stay a follow-up ticket.**

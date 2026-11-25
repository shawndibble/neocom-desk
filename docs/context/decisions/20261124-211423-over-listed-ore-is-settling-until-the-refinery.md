# Scope decisions — Over-listed ore is Settling until the refinery log catches up

_Recorded 2026-11-24._

- **Ore a member lists for the corporation's own Payee beyond what the book recorded is Settling, not a Conflict, until the day settles.** A day closes 30 minutes after UTC midnight and the next sync (20261026 "yesterday closes at 00:30"). The refinery log can still be writing the end of a member's mining after that sync, so a real member saw a Conflict for ore the log hadn't recorded yet. Settling is never billed or flagged, has no fixes to offer, and doesn't count among the Conflicts. It supersedes #6203's "the excess is a Conflict" only while the day is settling.
- **A day settles on evidence or after a day.** The evidence is the book holding that miner's ore at the same refinery on a later day, which shows the log has moved past the day. With no later mining there's nothing to show it, so the day also settles 24 hours after it ended. Measured log lag from sync times could shorten that later.
- **A closed day with Settling ore isn't called safe to pay.** The banner says the day is still settling. Paying is still allowed and pays what is billed so far. The rest is billed if it arrives.
- **Officers' billing doesn't change.** Settling is only what the member's view shows. The book bills what it recorded, on its date.

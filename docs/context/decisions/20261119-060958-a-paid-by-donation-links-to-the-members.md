# Scope decisions — A Paid by donation links to the member's own wallet entry when the journal still holds it

_Recorded 2026-11-19._

- **Each donation in a day's Paid by list links to the member's own wallet entry for it, when one is found.** This supersedes "links nowhere" in `20261119-054646-paid-by-lists-what-paid-a-day-on.md`; a payment with no entry still shows with no link. The corporation's journal entry has a different id from the member's, so the two are paired by sender, amount (within 1 ISK) and time (within 10 minutes), the rule `inFlightDonations` already used, now one predicate (`isSameTransfer`).
- **Pairing runs on the device, at read time, against the journal already loaded for the Tax tab.** Nothing about the member's wallet goes to the server and nothing is stored: a donation the journal no longer holds, or whose sender was not tracked, is simply unlinked. A new member or a new corporation book therefore starts with whatever history overlaps.
- **Never a guess.** An officer-recorded payment has no member entry and is never paired. Two entries equally near one donation, or one entry the nearest of two donations, pair none of them.
- **The link is the one manual records use** (`/wallet/journal?highlight=<refId>`). The journal page highlights by the character it is showing, so a donation an alt made opens on that alt's journal only when that character is the one viewed: the same limit those links already have.

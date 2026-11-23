# Scope decisions — Overview widgets that can read All characters: Wallet, Contracts, Mail, Calendar, Profit builds, Planetary

_Recorded 2026-11-22._

- **Six more kinds read All characters:** Wallet (Balance and Flow), Contracts, Mail, Calendar, Profit (Builds and Both) and Planetary. Each has its own All feed (`walletAll`, `journalAll`, `contractsAll`, `mailAll`, `calendarAll`, `profitAll`, `planetaryAll`) so a widget on the header Character reads exactly what it did before.
- **Stays header-Character only, on purpose:** Training (its queue list is per Character), SP, Location, Clones, Jump timers and LP (a per-Character fact, or a figure that cannot be pooled). Survey, Hauling, Market trend, Below market, Sov raids and Eve time read no Character at all.
- **A contract between two of your Characters counts once** (`summarizeContractsBoard` takes a set of pilots), and so does a mail or calendar event both can see. Mail's unread count adds each inbox's own count.
- **Wallet Flow on All does not remove transfers between your own Characters.** They cancel in the net but show in income and spending.
- **A Character whose read fails is left out, and only Wallet Balance says so.** Mail, Planetary, Contracts and Coming up total the Characters that answered; a note naming the ones missed is a follow-up.
- **An event two Characters were invited to is listed once, at the most committed RSVP** (accepted, then tentative, not responded, declined), so an alt's yes is never hidden by the main's unanswered copy. Corporation data is read once per corporation however many Characters belong to it (`corpReadAccess`), so it is never repeated.

# Scope decisions — Overview widgets that can read All characters: Wallet, Contracts, Mail, Calendar, Profit builds, Planetary

_Recorded 2026-11-22._

- **<Decision>.** <Why, and what it rules out.>

- **Six more kinds read All characters:** Wallet (Balance and Flow), Contracts, Mail, Calendar, Profit (Builds and Both) and Planetary. Each has its own All feed (`walletAll`, `journalAll`, `contractsAll`, `mailAll`, `calendarAll`, `profitAll`, `planetaryAll`) so a widget on the header Character reads exactly what it did before.
- **Stays header-Character only, on purpose:** Training (its queue list is per Character), SP, Location, Clones, Jump timers and LP (a per-Character fact, or a figure that cannot be pooled). Survey, Hauling, Market trend, Below market, Sov raids and Eve time read no Character at all.
- **A contract between two of your Characters counts once** (`summarizeContractsBoard` takes a set of pilots), and so does a mail or calendar event both can see. Mail's unread count adds each inbox's own count.
- **Wallet Flow on All does not remove transfers between your own Characters.** They cancel in the net but show in income and spending.

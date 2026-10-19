# Scope decisions — Moons nav entry is gated on the ledger role, not the granted scope (issue #4063)

_Recorded 2026-10-18 · issue #4063._

- **The Corp sub-nav's Moons entry shows to every Character whose roles can read the refinery ledger, whether or not the mining scope is granted yet, and whether or not the corporation has a Corp Tax Book.** The scope is additive (#4058), so gating on the granted capability would hide the only page that can ask for it; and a Director has to see the page to turn the book on (D10). D24's "only when the corp has an active book" governs members and the personal tab, not the officers who run it. The page branches on `miningLedgerAccess` (grant prompt) and the book summary (turn-on for a Director, an explanation otherwise). `useCorpViewCapabilities` supplies this one role-based capability to the rail, the palette and the sub-nav.
- **Drill-down pages live below their tab (`/corp/moons/extractions/<id>`, `/corp/moons/miners/<id>`), as `deep` page tabs.** The page stays mounted, Back returns to the table with its filters, and no extra route table entries are needed (ADR 0015).
- **The Needs you card for an overdue Miner offers Send reminder and Dismiss; Mark not tax is on the Miner page's payments.** The mockup's third button needs a particular donation, which a Miner-level card does not name.

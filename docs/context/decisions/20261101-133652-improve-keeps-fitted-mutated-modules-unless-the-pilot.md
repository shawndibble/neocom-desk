# Scope decisions — Improve keeps fitted mutated modules unless the pilot opts in (issue #5800)

_Recorded 2026-11-01 · issue #5800._

- **Probe result: Improve does swap a mutated slot today.** A throwaway integration test (real dogma engine, real `improveCandidates` and `findImprovements`) on an Astero with a rolled Abyssal Damage Control offered swaps of that slot under Rebalance and Rework (for example Best overall and Tankier at Rebalance, Explore better at Rework gave 20 rows). Upgrade offers none, because an abyssal type has no variations. The rolled CPU already counts in every candidate's recalculation (148 CPU used with the roll, 158 with the plain base). So the opt-in switch stays (ticket item 7 does not apply).
- **Mutated modules are left alone by default; one switch, "Swap mutated modules (their rolls are lost)", in the Improve panel's More section allows swaps.** It is not remembered, like the Officer tick: it is about this fit. A swap row, and a Makeover group, then says the roll is lost.
- **Copies are keyed per fitted module when mutated.** Plain copies of a type still merge into one suggestion; a mutated module is always its own candidate, since its roll is its own.
- **Tank conversions and the Makeover obey the same rule** (a conversion that strips a mutated module is dropped by default); the compensation swaps for an unflyable fix only use sibling variations, and an abyssal type has none.
- **A mutated module the pilot cannot fly is not force-replaced by default.** Improve says "N mutated modules kept" plus that it will not replace the one(s) the pilot cannot fly yet; with the switch on, the usual Make Flyable row appears and names the lost roll.
- **The kept count is every fitted mutated module**, not only those in racks the goal uses.

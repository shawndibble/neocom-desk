# Scope decisions — Market-Wide ISK/day assumptions (issue #2864)

_Recorded 2026-10-07 · issue #2864._

- **ISK/day assumes one job slot running continuously, and a 10% share of the 30-day daily volume.** Same one-slot basis as ISK/hour; 10% is a modest slice a single pilot can plausibly win. Share options are 5/10/25/50%. Multiple slots are out of scope.
- **A negative margin stays negative and is not volume-capped.** Building at a loss loses on every unit built, so the cap would hide the loss.
- **Unknown or zero daily volume shows '–', never 0.** An unread figure is not a measured zero; unknown sorts last.
- **Market-Wide only for v1.** Owned-blueprint views and the phone cards follow later.

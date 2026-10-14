# Scope decisions — Blueprint cost always counts; copies scale with runs

_Recorded 2026-10-14._

- **Blueprint cost always counts toward Industry profit.** The "Count blueprint cost toward Industry profit" setting (`sync.industryIncludeBlueprintCost`) is removed; Blueprint Acquisition's cost is always in `totalCost` and profit. A plan priced as if every blueprint were owned hid a real cost, and nobody needed it.
- **The blueprint row counts copies from runs.** Copies bought = `ceil(shortfall runs / runs per copy)`, priced per copy (a 500-run copy for 1000 runs is 2; a 1-run copy for 20 runs is 20).
- **A Build Group pools each blueprint across its members.** Per ME/TE tier the group sums the runs its members need, counts the Character's owned runs once, and derives the copies from that, so three plans sharing a 500-run copy need one, and one owned copy cannot be spent by two plans. The group's blueprint row, `materialCost`, `totalCost` and `profit` all reflect it. Members' own pages still price alone.
- **A blueprint override price is per copy.** It used to price the whole shortfall; with several copies bought it now multiplies by the copy count. An existing override on a plan that needs more than one copy therefore bills more than before.

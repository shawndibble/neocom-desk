# Scope decisions — Industry page reads verdict first

_Recorded 2026-09-06._

- **A Build Plan opens on its answer, not its inputs.** The first panel of a
  plan is the verdict hero: net profit as one large figure, the margin,
  ISK/hour, duration and break-even on one line under it, and the Acquisition
  Verdict, Sale Profitability and Use-or-Sell Check as three labelled pills.
  Every number on it also appears in the ledger below; the hero exists so the
  answer is read before the working. Rules out a plan whose first screen is a
  form.
- **Inputs fold behind a chip summary.** Runs, ME/TE, facility · system ·
  band, rig, tax, trade hub and material price basis are read as `StatChip`s
  under a "Setup" header and edited only after "Edit setup". A plan is edited
  once and read many times; the chips are the reading form. The controls and
  their behaviour are unchanged, only their default visibility.
- **The ledger sits beside the materials, not under them.** "Costs & revenue"
  (formerly the "Results" panel) shares a row with the materials table from
  `xl` up, and folds by default below that width so a phone reaches the
  materials without scrolling past thirty key/value rows. Its fold follows
  the viewport until the pilot toggles it. The Calculation Breakdown is owned
  by the hero, so the hero's button and the ledger's "?"s open the same modal
  whether or not the ledger is open.
- **Active Jobs is a strip until asked.** With jobs running, the panel shows
  its header only: how many run and how many are done, which finishes next,
  and (desktop) one small bar per job. The six-column table is one click
  away. Loading, re-auth and the empty states are never folded — they are the
  whole story. The corp/personal switch stays outside the fold, because it
  changes what the strip summarises.
- **Production Runs fold to their rollup.** The per-plan panel header states
  runs logged, realized profit and how many are still selling; the table opens
  on request. An empty panel does not fold — there is nothing to hide. "Log
  Production" is offered from the hero as well as the panel; the panel still
  owns the form.
- **Records leads with the total.** The Production Log puts total realized
  profit as one large figure with the cost / revenue / open inventory / average
  margin ledger under it, "By item" beside it, and "All production runs" folded
  below — the aggregate answers what is making money, the run list is the
  audit trail behind it. Average margin is realized profit over linked revenue,
  weighted, the same rule the per-item column already uses.
- **Nothing is removed, only folded.** Every figure, control and export the
  page had is still reachable in one click; the change is what shows by
  default. The fold states are session-local, not persisted.

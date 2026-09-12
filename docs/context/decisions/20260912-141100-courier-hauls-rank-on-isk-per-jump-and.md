# Scope decisions — Courier hauls rank on ISK per jump, and the route preference is the hauler's (issue #943)

_Recorded 2026-09-12 · issue #943._

- **ISK per jump is the courier board's ranking figure; ISK per m³ is not.** A
  hauler's cost is the trip, and the trip is jumps. Volume is a _gate_ — does
  this fit my hull — which the max-volume filter already expresses, and it
  only becomes a rate for a hauler consolidating several contracts into one
  run. The established haul services price per jump against a size tier, not
  per m³. This rules out reward as the default sort, and it demotes the
  ISK/m³ column of issue #938 from the board's ranking figure to a secondary
  read.

- **The route preference is a control, not a constant.** Some haulers fly
  highsec only; others cross a 0.4 system for a shorter run. Those are
  different jump counts for the same contract and therefore different rates,
  so a single fixed preference would quote every hauler a number computed for
  somebody else's trip. Defaults to prefer-highsec, the trip most will
  actually fly. This settles the "shortest or safest?" question issue #826 was
  flagged non-delegable on: the player picks.

- **That preference lives in component state and is deliberately not
  persisted.** The local-stargate-graph decision (issue #942, recorded
  2026-09-12) holds that unifying the three
  route-preference vocabularies becomes a stored-value migration once a second
  _persisted_ control ships, and should therefore happen first. Keeping this
  one unsaved leaves the count at three and leaves that unification ahead of
  whoever ships a saved control, rather than making it their migration to
  perform. Rules out adding a `SYNCED_SETTING_KEYS` entry or a
  `createLocalSetting` here.

- **Volume and days-to-complete give up their columns to jumps and ISK/jump.**
  Two columns arrive and the table sits at a seven-column ceiling, but the
  binding constraint is the stacked card below `sm`, where every column is a
  line and `docs/DESIGN.md` §4a forbids hiding one at a width ("one DOM at
  every width"). Holding the card at its existing height therefore costs two
  columns, not one. Volume and deadline are the two that go because both are
  constraints a hauler settles once — does this fit, am I given long enough —
  and both remain as filters and as detail-modal figures. Rules out a
  `sm:hidden` column, and rules out `cardCorner`, which strips the label a
  figure needs.

- **A haul with no measurable distance sorts last in either direction, via
  `undefined` rather than a stand-in figure.** `DataTable` sinks a valueless
  row to the end whichever way the column is sorted; a large or small sentinel
  is a real value and leads the table on one of them. The distinction matters
  most on this board, where the unmeasurable rows are exactly the
  player-structure destinations issue #944 flags as risky.

- **Distances for the whole filtered set are computed in one grouped pass, and
  that pass is synchronous main-thread work this ticket accepts.** Ranking the
  full set before the row cap is an acceptance criterion, so the work cannot
  be limited to the visible page, and the graph load is awaited first so the
  board paints before it runs. Measured against #942's own figures the pass is
  in the hundreds of milliseconds for a few hundred distinct origins. Making
  it free needs a distance cache with eviction or a worker; both are their own
  change, and neither is this one. Rules out silently narrowing the ranking to
  the visible rows to make the number look better.

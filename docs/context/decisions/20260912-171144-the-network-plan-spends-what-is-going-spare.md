# Scope decisions — The network plan spends what is going spare, not what is produced

_Recorded 2026-09-12._

- **A colony's supply to the network plan is its Exportable Rate — production
  less its own Local Draw — not its gross output.** A pilot running eight
  Advanced pins on Nanites over four Basic pins on Bacteria was told to add a
  ninth Advanced pin on Test Cultures and that its Bacteria was "made here".
  Both schematics eat 40 Bacteria an hour; the colony extracted enough
  Microorganisms for 45.8 Bacteria an hour and the Nanite pins already wanted 320. The plan had been handed gross production and spent it. This rules out
  reading `colonyOutputPerHour` as availability anywhere: it answers what a
  colony _makes_, which is a different question from what it has _spare_, and
  `NetworkColony.exportablePerHour` is named for the question it answers.

- **A line's draw on a locally-made input counts whatever that line's status.**
  `factoryBalance` marks a whole line `inputs-not-local` when any one input is
  neither extracted nor made on the planet, and everything downstream then
  stopped reasoning about that line's _other_ input — the one the colony does
  make. So a line was credited for its output at its built pin count and
  charged for its local input at zero. This rules out gating consumption on
  `status === 'measured'`, and rules out reading `MeasuredBalance.demandPerHour`
  for it, which only exists on the lines that were never the problem.

- **The charge and the credit read the same pin count, by construction.**
  `effectivePins` is the single expression both sides use. Not a proof that the
  two assumptions agree — crediting output at built pins assumes every input
  arrives, while charging a local input at built pins assumes the local one
  fills those pins, and they diverge on a colony importing some of a product it
  also makes. It is a decision about which way to be wrong: understate what is
  spare, and understate earnings, rather than invent a facility nobody can
  feed. The same direction every unmeasurable figure on this tab takes.

- **A product a colony wholly consumes is absent from the map, not zero.**
  Every read in `planNetwork` tests `(… ?? 0) > 0`, so absence already reads as
  "this set cannot supply it" — which is the question those reads ask. This has
  a deliberate consequence at two of them: such a product now counts as
  _bought_ when sizing a candidate, and a colony that eats one of its own
  inputs is no longer `selfSufficient`. Both follow from the same truth — the
  material is committed — and neither is a special case to be exempted.

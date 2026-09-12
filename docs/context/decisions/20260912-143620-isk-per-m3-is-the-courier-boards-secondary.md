# Scope decisions — ISK per m3 is the courier board's secondary rate, not its ranking one (issue #938)

_Recorded 2026-09-12 · issue #938._

- **ISK/m³ ships as a sortable column but does not take the default sort.**
  This ticket was written before #943 and assumed ISK/m³ was the figure a
  hauler ranks on. It is not: the cost of a haul is the trip, so ISK/jump
  ranks the board. ISK/m³ answers the narrower question of a hauler filling
  one hold from several contracts along a lane, where space rather than
  distance is the scarce thing. Ruling out the default sort is the whole
  correction — the column itself is still worth its width.

- **The three derived figures move into one pure engine module rather than
  living where each is rendered.** `iskPerJump` was a private function inside
  the table component; ISK/m³ and the collateral ratio would have been two
  more, in two files, with the table and the detail modal each free to divide
  differently. `engine/contracts/courierRates.ts` holds all three so the two
  surfaces cannot drift, and so the zero cases are tested once. Rules out a
  second copy of the arithmetic in `CourierContractDetailModal`.

- **Every rate answers `null` where its denominator makes the figure
  unknowable, and the UI sinks those rows in either sort direction.** This is
  not defensive coding: the publisher's numeric parser rejects only an empty
  column, so a stated `0` volume or reward is kept deliberately and arrives as
  a real row. A zero-volume haul therefore has no ISK/m³, and a free haul has
  no collateral ratio. Distinct from a rate that genuinely _is_ zero — a
  favour run moving real cargo pays zero per m³, which is a fact about the
  contract. Rules out rendering `Infinity`, rules out a stand-in figure, and
  rules out dropping the row.

- **The collateral-to-reward ratio is a detail-modal figure, not a column.**
  Both raw numbers already sit side by side in the table, the max-collateral
  filter is where the concern is acted on, and the table is at its width. It
  is shown where a hauler decides on one contract rather than where they scan
  fifty. Rules out an eighth column.

- **Volume and days-to-complete stay out of the table.** #943 dropped both to
  hold the stacked card's height, and adding ISK/m³ spends the one column that
  freed. Both remain filters and detail-modal figures. Rules out restoring
  either alongside the rate derived from one of them.

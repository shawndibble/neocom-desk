/**
 * The key of every `loadStationBestPrices` entry (`orderCompetition.ts`), and
 * of every lookup against that map (`openOrdersModel.ts`, `OpenOrdersPanel`).
 *
 * One line, its own module, because the writer and the readers sit on opposite
 * sides of the fetch boundary: the model composes rows without importing
 * anything that talks to the network, so it cannot reach into the loader for
 * this, and a second copy of the template would fail silently — a lookup that
 * finds nothing is indistinguishable from a station with no orders on that
 * side.
 */
export function stationPriceKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}

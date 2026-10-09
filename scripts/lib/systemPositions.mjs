/**
 * Bake of `market/systemPositions.json`: every solar system's map position in
 * light years, for the jump-drive engine (`src/engine/route/jumpDrive.ts`).
 *
 * Stored apart from `systems.json` so the many pages that only want a name or
 * a security status do not download ~8,400 x 3 extra numbers, and flat
 * (`[id, x, y, z, id, x, y, z, ...]`) because an array of objects would spend
 * more bytes on keys than on values. Light years to two decimals (~1e14 m)
 * is far finer than any jump-range decision needs.
 */

/** Metres in one light year (the figure the game's own range maths uses). */
export const METRES_PER_LIGHT_YEAR = 9.4607e15;

/**
 * @param {readonly { id: number, x: number, y: number, z: number }[]} systems
 *   positions in metres, as `mapSolarSystems.csv` carries them
 * @returns {number[]} the flat array, ordered by system id
 */
export function bakeSystemPositions(systems) {
  const flat = [];
  const round = (metres) => Math.round((metres / METRES_PER_LIGHT_YEAR) * 100) / 100;
  for (const s of [...systems].sort((a, b) => a.id - b.id)) {
    flat.push(s.id, round(s.x), round(s.y), round(s.z));
  }
  return flat;
}

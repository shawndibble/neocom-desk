export const METRES_PER_LIGHT_YEAR = 9.4607e15;

export function bakeSystemPositions(systems) {
  const flat = [];
  const round = (metres) => Math.round((metres / METRES_PER_LIGHT_YEAR) * 100) / 100;
  for (const s of [...systems].sort((a, b) => a.id - b.id)) {
    flat.push(s.id, round(s.x), round(s.y), round(s.z));
  }
  return flat;
}

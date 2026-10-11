/**
 * A station or structure name cut down to its solar system, for a one-line
 * route ("Jita IV - Moon 4 - Caldari Navy Assembly Plant" is "Jita"). NPC
 * stations read "<System> <planet numeral> [(Moon)] - <owner>"; structures
 * read "<System> - <name>". The first segment is the system either way.
 */
const ROMAN_TAIL = /\s+(?:[IVX]{1,5})$/;

export function shortPlaceName(full: string): string {
  const first = (full.split(' - ')[0] ?? '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const withoutPlanet = first.replace(ROMAN_TAIL, '');
  return withoutPlanet === '' ? first : withoutPlanet;
}

/** A station or structure name up to its first " - ": where it is, without who owns it ("Jita IV - Moon 4 - Navy" is "Jita IV"). */
export function placeHead(full: string): string {
  return (full.split(' - ')[0] ?? '').trim();
}

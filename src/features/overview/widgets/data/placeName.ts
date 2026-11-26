const ROMAN_TAIL = /\s+(?:[IVX]{1,5})$/;

export function shortPlaceName(full: string): string {
  const first = (full.split(' - ')[0] ?? '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const withoutPlanet = first.replace(ROMAN_TAIL, '');
  return withoutPlanet === '' ? first : withoutPlanet;
}

export function placeHead(full: string): string {
  return (full.split(' - ')[0] ?? '').trim();
}

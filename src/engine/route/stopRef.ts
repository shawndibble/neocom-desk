export interface StopRef {
  systemId: number;
  stationId: number | null;
}

function positiveInt(raw: string): number | null {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

export function parseStopRefs(raw: string | null): StopRef[] {
  if (raw === null || raw === '') return [];
  const refs: StopRef[] = [];
  for (const token of raw.split(',')) {
    const parts = token.split(':');
    if (parts.length > 2) return [];
    const systemId = positiveInt(parts[0]);
    const stationId = parts.length === 2 ? positiveInt(parts[1]) : null;
    if (systemId === null || (parts.length === 2 && stationId === null)) return [];
    refs.push({ systemId, stationId });
  }
  return refs;
}

export function serializeStopRefs(refs: readonly StopRef[]): string | null {
  if (refs.length === 0) return null;
  return refs
    .map((ref) => (ref.stationId === null ? `${ref.systemId}` : `${ref.systemId}:${ref.stationId}`))
    .join(',');
}

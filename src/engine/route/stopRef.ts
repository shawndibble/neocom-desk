/**
 * A Stop as the Route Safety link carries it (issue #4964): a system, plus the
 * station the pilot named there, if any. The station is a label on the stop —
 * the gate route is the system's — so it never reaches the routing.
 *
 * Wire form is `system` or `system:station`, comma-separated. A link with only
 * plain system ids, the only kind there was before, reads exactly as it did.
 */
export interface StopRef {
  systemId: number;
  /** The NPC station or structure named at this stop; `null` for the system alone. */
  stationId: number | null;
}

function positiveInt(raw: string): number | null {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

/** The stops a `stops` parameter names; a list with any unreadable token is no stops at all. */
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

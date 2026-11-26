import {
  audienceKey,
  type PopAudience,
  type PopSharingDoc,
} from '../../../functions/src/popSharing';
import { isHandled, sharingMoons, type SharingMoonRow } from './sharingMoons';

export type PopShareMark = { kind: 'shared'; audiences: PopAudience[] } | { kind: 'opted-out' };

export interface PopShareMarks {
  moons: Record<string, PopShareMark>;
  structures: Record<string, PopShareMark>;
  owners: Record<string, PopShareMark>;
}

export function popShareMark(row: SharingMoonRow): PopShareMark | null {
  if (row.ownerOptedOut) return { kind: 'opted-out' };
  return row.effective.shared
    ? { kind: 'shared', audiences: row.effective.settings.audiences }
    : null;
}

export function popShareMarks(
  extractions: Parameters<typeof sharingMoons>[0],
  feeders: Parameters<typeof sharingMoons>[1],
  doc: PopSharingDoc
): PopShareMarks {
  const marks: PopShareMarks = { moons: {}, structures: {}, owners: {} };
  if (!doc.enabled) return marks;
  const ownerAudiences = new Map<number, Map<string, PopAudience>>();
  const rows = sharingMoons(extractions, feeders, doc);
  const audienceSets = new Set<string>();
  for (const row of rows) {
    const mark = popShareMark(row);
    if (mark?.kind === 'opted-out') continue;
    audienceSets.add(
      mark ? mark.audiences.map(audienceKey).sort().join('|') || 'shared' : 'unshared'
    );
  }
  const uniform = audienceSets.size === 1 && !audienceSets.has('unshared');
  for (const row of rows) {
    const mark = popShareMark(row);
    if (!mark || (uniform && mark.kind === 'shared')) continue;
    marks.moons[String(row.moonId)] = mark;
    marks.structures[String(row.structureId)] = mark;
    if (mark.kind !== 'shared' || row.ownerCorporationId === undefined) continue;
    const audiences = ownerAudiences.get(row.ownerCorporationId) ?? new Map();
    for (const a of mark.audiences)
      if (!audiences.has(audienceKey(a))) audiences.set(audienceKey(a), a);
    ownerAudiences.set(row.ownerCorporationId, audiences);
  }
  for (const [owner, audiences] of ownerAudiences) {
    marks.owners[String(owner)] = { kind: 'shared', audiences: [...audiences.values()] };
  }
  for (const f of feeders) {
    if (f.popSharingOptOut !== undefined && isHandled(f))
      marks.owners[String(f.corporationId)] = { kind: 'opted-out' };
  }
  return marks;
}

/**
 * The share and opted-out marks on the book's moon lists (issue #6226): a shared moon carries
 * its effective audiences, a moon whose owner opted out carries the opted-out mark, an unshared
 * moon none, and a book whose Pop Sharing is off marks nothing at all.
 * Built from the Sharing tab's own rows (`sharingMoons`), so a mark never disagrees
 * with the settings. Keyed by moon, by refinery (the Moon extractions widget's rows name a
 * refinery, not a moon) and by moon owner. Plain records, so a widget read can carry them.
 *
 * A mark flags an exception. When every moon the book handles is shared with the same audiences,
 * the shared mark would sit on every row and say nothing, so it is left off (#6226 follow-up);
 * an opted-out mark always stays.
 */
import {
  audienceKey,
  type PopAudience,
  type PopSharingDoc,
} from '../../../functions/src/popSharing';
import { isHandled, sharingMoons, type SharingMoonRow } from './sharingMoons';

export type PopShareMark = { kind: 'shared'; audiences: PopAudience[] } | { kind: 'opted-out' };

export interface PopShareMarks {
  /** By moon id. */
  moons: Record<string, PopShareMark>;
  /** By the refinery of the moon's latest Extraction. */
  structures: Record<string, PopShareMark>;
  /** By moon owner corporation: opted out, else every audience its shared moons reach. */
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
  // A book that shares nothing marks nothing: an opted-out mark there would only be noise.
  if (!doc.enabled) return marks;
  const ownerAudiences = new Map<number, Map<string, PopAudience>>();
  const rows = sharingMoons(extractions, feeders, doc);
  // Opt-outs are exceptions themselves, so they never stop the rest reading as alike.
  const audienceSets = new Set<string>();
  for (const row of rows) {
    const mark = popShareMark(row);
    if (mark?.kind === 'opted-out') continue;
    audienceSets.add(
      mark ? mark.audiences.map(audienceKey).sort().join('|') || 'shared' : 'unshared'
    );
  }
  // Every moon shared alike: nothing to tell apart.
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
  // The opt-out is the owner's own, whether or not any of its moons has synced yet.
  for (const f of feeders) {
    if (f.popSharingOptOut !== undefined && isHandled(f))
      marks.owners[String(f.corporationId)] = { kind: 'opted-out' };
  }
  return marks;
}

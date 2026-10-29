/**
 * A shared **Survey**: a `survey` Share Link (`shares/{id}`, same id, URL and
 * 7-day lifetime as every other stored Share Link) whose Survey Scans live in
 * a create-only subcollection, `shares/{id}/surveyScans`, one doc per paste.
 *
 * Anyone holding the link can add a scan and no sign-in is needed: the
 * visitor who keeps a Survey going after the pilot who started it has left
 * may have no account. Only starting one needs a Firebase session, as for any
 * other Share Link. A scan stores the pasted text (the same parser rebuilds
 * the rocks on every reader), the server's clock as its time, and the
 * survey's own expiry so the TTL policy deletes it with the survey.
 *
 * The moon tax (who gets it, at what rate) lives the same way, in a create-only
 * `surveyTax` subcollection: a share can't be rewritten, so each change is a new
 * doc and the newest one is the tax. Only a signed-in pilot can write one.
 *
 * So are the location the fleet is mining at and the starter's notes
 * (`surveyInfo`): each doc is the whole current info, so the newest alone
 * decides and a notes edit can't drop the location.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  type QuerySnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore/lite';
import { generateShareId } from '@/engine/share/shareId';
import { parseSurveyScan } from '@/engine/survey/parseScan';
import type { SurveyRock, SurveyScan } from '@/engine/survey/series';
import { loadShare, saveShare, shareFirestore, shareUrl } from '@/features/share/shareStore';
import { isMissingIndex } from '@/sync/missingIndex';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureAnySession } from '@/sync/syncAuth';
import { MAX_SCAN_TEXT, rejectScanText, ScanRejected } from './scanResult';
import { MINUTE_MS } from '@/lib/age';

export { MAX_SCAN_TEXT };

export const SURVEY_SCANS_COLLECTION = 'surveyScans';
export const SURVEY_TAX_COLLECTION = 'surveyTax';
export const SURVEY_IGNORES_COLLECTION = 'surveyIgnores';
export const SURVEY_INFO_COLLECTION = 'surveyInfo';

/** Who gets the moon tax on a Survey, and the rate (0 to 100). */
export interface SurveyTaxShare {
  name: string;
  pct: number;
}

export const MAX_TAX_NAME = 100;

/**
 * Where to mine, and the starter's notes for the fleet. The location is a solar
 * system, NPC station or structure id (what ESI's waypoint call takes), with its
 * name stored beside it: a visitor with no sign-in can't resolve a structure's.
 * A manual location (a structure the search couldn't find, typed as free text)
 * has a name and no id, so there is nothing to send as a waypoint.
 */
export interface SurveyInfoShare {
  location: { id: number | null; name: string } | null;
  notes: string;
}

/** Mirrored by the size checks in `firestore.rules`. */
export const MAX_LOCATION_NAME = 120;
export const MAX_SURVEY_NOTES = 1000;

/** Mirrored by the size check in `firestore.rules`. */
export const MAX_SCAN_BY = 100;

export async function startSurvey(input: {
  characterId: number;
  /** The starting pilot's Character name, kept on the survey so they can be recognised as its owner. */
  ownerName: string;
}): Promise<{ id: string; url: string; expiresAt: number }> {
  const id = generateShareId();
  const expiresAt = await saveShare({
    id,
    type: 'survey',
    payload: { v: 1, owner: input.ownerName },
    characterId: input.characterId,
  });
  return { id, url: shareUrl(id), expiresAt };
}

export async function addSurveyScan(input: {
  id: string;
  text: string;
  /** The survey's own expiry, as `loadSurvey` or `startSurvey` returned it. */
  expiresAt: number;
  /** The submitting Character's name, or none for an anonymous visitor. */
  by?: string | null;
  /** Writes under this Character's session; omitted for an anonymous visitor (the rules allow it). */
  characterId?: number;
}): Promise<void> {
  const rejected = rejectScanText(input.text);
  if (rejected !== null) throw new ScanRejected(rejected);
  const by = input.by?.trim().slice(0, MAX_SCAN_BY) ?? '';
  await addDoc(
    collection(shareFirestore(input.characterId), 'shares', input.id, SURVEY_SCANS_COLLECTION),
    {
      text: input.text,
      ...(by === '' ? {} : { by }),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt),
    }
  );
}

/**
 * Marks the field cleared. The scanner has nothing to copy once the last rock is
 * gone, so no paste can say so: this stores a scan with no text, flagged
 * `cleared`, which every reader loads as a scan with no rocks. Like any scan it
 * can be set aside by the owner, which puts the survey back to mining.
 */
export async function finishSurvey(input: {
  id: string;
  /** The survey's own expiry, as `loadSurvey` or `startSurvey` returned it. */
  expiresAt: number;
  /** The Character name of whoever marked it, or none for an anonymous visitor. */
  by?: string | null;
  /** Writes under this Character's session; omitted for an anonymous visitor (the rules allow it). */
  characterId?: number;
}): Promise<void> {
  const by = input.by?.trim().slice(0, MAX_SCAN_BY) ?? '';
  await addDoc(
    collection(shareFirestore(input.characterId), 'shares', input.id, SURVEY_SCANS_COLLECTION),
    {
      text: '',
      cleared: true,
      ...(by === '' ? {} : { by }),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt),
    }
  );
}

export async function setSurveyTax(input: {
  id: string;
  expiresAt: number;
  name: string;
  pct: number;
  /** The signed-in Character writing it. */
  characterId: number;
}): Promise<void> {
  await ensureAnySession(input.characterId);
  await addDoc(
    collection(getSyncFirestore(input.characterId), 'shares', input.id, SURVEY_TAX_COLLECTION),
    {
      name: input.name.slice(0, MAX_TAX_NAME),
      pct: input.pct,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt),
    }
  );
  markDetailsDue(input.id);
}

/** Stores the survey's location and notes. Empty ones are left out, which is how they are cleared. */
export async function setSurveyInfo(input: {
  id: string;
  expiresAt: number;
  location: { id: number | null; name: string } | null;
  notes: string;
  /** The signed-in Character writing it. */
  characterId: number;
}): Promise<void> {
  const notes = input.notes.trim().slice(0, MAX_SURVEY_NOTES);
  await ensureAnySession(input.characterId);
  await addDoc(
    collection(getSyncFirestore(input.characterId), 'shares', input.id, SURVEY_INFO_COLLECTION),
    {
      ...(input.location === null
        ? {}
        : {
            ...(input.location.id === null ? {} : { locationId: input.location.id }),
            locationName: input.location.name.slice(0, MAX_LOCATION_NAME),
          }),
      ...(notes === '' ? {} : { notes }),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt),
    }
  );
  markDetailsDue(input.id);
}

/**
 * Hands the survey to another Character: the one update a `survey` share allows
 * (`payload.owner` alone). The rules can't tell who the current owner is, so
 * the app only offers this to them.
 */
export async function setSurveyOwner(input: {
  id: string;
  owner: string;
  /** The signed-in Character handing it over. */
  characterId: number;
}): Promise<void> {
  const owner = input.owner.trim().slice(0, MAX_SCAN_BY);
  if (owner === '') throw new Error('A survey needs an owner name.');
  await ensureAnySession(input.characterId);
  await updateDoc(doc(getSyncFirestore(input.characterId), 'shares', input.id), {
    'payload.owner': owner,
  });
  markDetailsDue(input.id);
}

/**
 * Sets a scan aside (or takes it back). Create-only like the scans: the newest
 * doc for a scan decides, so restoring is a newer doc, never an update. Only
 * the survey's owner is offered this; the rules can't tell who that is.
 */
export async function setSurveyScanIgnored(input: {
  id: string;
  expiresAt: number;
  scanId: string;
  ignored: boolean;
  /** The signed-in Character setting it aside. */
  characterId: number;
}): Promise<void> {
  await ensureAnySession(input.characterId);
  await addDoc(
    collection(getSyncFirestore(input.characterId), 'shares', input.id, SURVEY_IGNORES_COLLECTION),
    {
      scanId: input.scanId,
      ignored: input.ignored,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(input.expiresAt),
    }
  );
}

export type LoadSurveyResult =
  | {
      ok: true;
      scans: SurveyScan[];
      expiresAt: number;
      owner: string | null;
      tax: SurveyTaxShare | null;
      info: SurveyInfoShare | null;
      /** Ids of the scans the owner set aside; the survey's totals leave them out. */
      ignored: ReadonlySet<string>;
    }
  | { ok: false; reason: 'not-found' | 'failed' };

/**
 * How long a load reuses the share doc (expiry, owner), the tax and the info
 * before reading them again. They rarely change, and this app's own edits mark
 * them due at once (`markDetailsDue`), so only another pilot's edit waits.
 */
export const SURVEY_DETAILS_TTL_MS = 5 * MINUTE_MS;

/**
 * What this tab has read of one survey. The lite SDK has no cache and every
 * returned doc is billed, and the Survey page polls; the scans and ignores are
 * create-only, so a load after the first asks only for docs at or after the
 * newest `createdAt` already seen and merges them in.
 */
interface SurveyCache {
  expiresAt: number;
  owner: string | null;
  tax: SurveyTaxShare | null;
  info: SurveyInfoShare | null;
  /** When the share doc, tax and info were last read; 0 when they are due. */
  detailsReadAt: number;
  /**
   * Bumped by each of this app's edits to them, so a load that began before
   * the edit (and read the old values) doesn't mark them fresh again.
   */
  detailsGen: number;
  scans: Map<string, SurveyScan>;
  scansCursor: Timestamp | null;
  ignores: Map<string, { at: number; ignored: boolean }>;
  ignoresCursor: Timestamp | null;
}

const caches = new Map<string, SurveyCache>();
/** Loads under way, so a cached read (the picker) at mount waits for the page's first load instead of paying for its own. */
const inflight = new Map<string, Promise<LoadSurveyResult>>();
/**
 * The subcollections whose `createdAt` index is not deployed yet (indexes go
 * out by hand): they fall back to a full read for the rest of the session
 * rather than failing every poll.
 */
const missingIndex = new Set<string>();

/** Drops what was read of every survey. For tests. */
export function forgetSurveyCache(): void {
  caches.clear();
  inflight.clear();
  missingIndex.clear();
}

/** The next load re-reads the share doc, tax and info: this app just changed one. */
function markDetailsDue(id: string): void {
  const cache = caches.get(id);
  if (cache === undefined) return;
  cache.detailsReadAt = 0;
  cache.detailsGen += 1;
}

function subcollection(id: string, name: string) {
  return collection(shareFirestore(), 'shares', id, name);
}

/** Runs the indexed query, or the full read when the index isn't there. */
async function readIndexed(
  name: string,
  full: () => Promise<QuerySnapshot>,
  indexed: () => Promise<QuerySnapshot>
): Promise<QuerySnapshot> {
  if (missingIndex.has(name)) return full();
  try {
    return await indexed();
  } catch (error) {
    if (!isMissingIndex(error)) throw error;
    missingIndex.add(name);
    return full();
  }
}

/**
 * The docs created at or after `cursor` (all of them when there is none).
 * `>=`, not `>`: two docs can share a server time, and an empty result is
 * billed as one read anyway, so re-reading the boundary doc costs nothing and
 * the merge drops it by id.
 */
function docsSince(id: string, name: string, cursor: Timestamp | null): Promise<QuerySnapshot> {
  const col = subcollection(id, name);
  if (cursor === null) return getDocs(col);
  return readIndexed(
    name,
    () => getDocs(col),
    () => getDocs(query(col, where('createdAt', '>=', cursor)))
  );
}

/** The newest doc alone: the tax and the info are whole values, so only it counts. */
function newestDocs(id: string, name: string): Promise<QuerySnapshot> {
  const col = subcollection(id, name);
  return readIndexed(
    name,
    () => getDocs(col),
    () => getDocs(query(col, orderBy('createdAt', 'desc'), limit(1)))
  );
}

/** The later of two server times, to the nanosecond: two docs can land in the same millisecond. */
function laterOf(cursor: Timestamp | null, at: Timestamp): Timestamp {
  if (cursor === null) return at;
  const ms = at.toMillis() - cursor.toMillis();
  return ms > 0 || (ms === 0 && at.nanoseconds > cursor.nanoseconds) ? at : cursor;
}

/** A stored scan's rocks, or null when its text is not a scan. */
function parseScanDoc(text: unknown): SurveyRock[] | null {
  return typeof text === 'string' ? parseSurveyScan(text) : null;
}

/** The Character name a survey was started under; null for one stored before owners existed. */
function ownerOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { owner } = payload as { owner?: unknown };
  return typeof owner === 'string' && owner !== '' ? owner : null;
}

function resultOf(cache: SurveyCache): LoadSurveyResult {
  return {
    ok: true,
    scans: [...cache.scans.values()].sort((a, b) => a.at - b.at),
    expiresAt: cache.expiresAt,
    owner: cache.owner,
    tax: cache.tax,
    info: cache.info,
    ignored: new Set([...cache.ignores].filter(([, v]) => v.ignored).map(([scanId]) => scanId)),
  };
}

/**
 * The survey as it stands now. The scans and ignores are always read (only what
 * is new since the last load, once one has run), so a paste compared against
 * this sees a scan another pilot added a moment ago; the share doc, tax and
 * info are re-read once `SURVEY_DETAILS_TTL_MS` has passed.
 */
export function loadSurvey(id: string): Promise<LoadSurveyResult> {
  const load = readSurvey(id).finally(() => {
    if (inflight.get(id) === load) inflight.delete(id);
  });
  inflight.set(id, load);
  return load;
}

async function readSurvey(id: string): Promise<LoadSurveyResult> {
  const startedAt = Date.now();
  let cache = caches.get(id);
  // Past its expiry the rules refuse every read: ask the share doc, which says "gone".
  if (cache !== undefined && cache.expiresAt <= startedAt) {
    caches.delete(id);
    cache = undefined;
  }
  const detailsDue =
    cache === undefined || startedAt - cache.detailsReadAt >= SURVEY_DETAILS_TTL_MS;
  const gen = cache?.detailsGen ?? 0;
  let entry: SurveyCache;
  if (cache !== undefined && !detailsDue) {
    entry = cache;
  } else {
    const found = await loadShare(id);
    const gone = !found.ok ? found.reason !== 'failed' : found.share.type !== 'survey';
    if (gone) {
      caches.delete(id);
      return { ok: false, reason: 'not-found' };
    }
    if (!found.ok) return { ok: false, reason: 'failed' };
    const details = { expiresAt: found.share.expiresAt, owner: ownerOf(found.share.payload) };
    entry = cache ?? {
      ...details,
      tax: null,
      info: null,
      detailsReadAt: 0,
      detailsGen: 0,
      scans: new Map(),
      scansCursor: null,
      ignores: new Map(),
      ignoresCursor: null,
    };
    Object.assign(entry, details);
  }

  try {
    await Promise.all([
      pullScans(id, entry),
      pullIgnores(id, entry),
      detailsDue ? pullTax(id, entry) : null,
      detailsDue ? pullInfo(id, entry) : null,
    ]);
  } catch {
    // Check the share again next time: the survey may have gone.
    entry.detailsReadAt = 0;
    return { ok: false, reason: 'failed' };
  }
  if (detailsDue && entry.detailsGen === gen) entry.detailsReadAt = startedAt;
  caches.set(id, entry);
  return resultOf(entry);
}

/**
 * The survey as this tab last read it, with no read at all, or a load when it
 * has none. For a label (the survey picker), where a little staleness is fine.
 */
export async function loadSurveyCached(id: string): Promise<LoadSurveyResult> {
  const cache = caches.get(id);
  if (cache !== undefined && cache.expiresAt > Date.now()) return resultOf(cache);
  return inflight.get(id) ?? loadSurvey(id);
}

/** Merges the scans created since the last pull. A failed read throws: there is no survey without its scans. */
async function pullScans(id: string, cache: SurveyCache): Promise<void> {
  const snapshot = await docsSince(id, SURVEY_SCANS_COLLECTION, cache.scansCursor);
  for (const d of snapshot.docs) {
    const data = d.data();
    if (!(data.createdAt instanceof Timestamp)) continue;
    cache.scansCursor = laterOf(cache.scansCursor, data.createdAt);
    const rocks = data.cleared === true ? [] : parseScanDoc(data.text);
    if (rocks === null) continue;
    const by = typeof data.by === 'string' && data.by.trim() !== '' ? data.by.trim() : undefined;
    cache.scans.set(d.id, {
      id: d.id,
      at: data.createdAt.toMillis(),
      rocks,
      ...(by === undefined ? {} : { by }),
    });
  }
}

/** The newest tax stored on the survey, or null. A failed read keeps what was read before: the scans still load. */
async function pullTax(id: string, cache: SurveyCache): Promise<void> {
  try {
    const snapshot = await newestDocs(id, SURVEY_TAX_COLLECTION);
    let newest: { at: number; tax: SurveyTaxShare } | null = null;
    for (const d of snapshot.docs) {
      const data = d.data();
      if (typeof data.name !== 'string' || data.name.trim() === '') continue;
      if (typeof data.pct !== 'number' || !(data.pct >= 0 && data.pct <= 100)) continue;
      if (!(data.createdAt instanceof Timestamp)) continue;
      const at = data.createdAt.toMillis();
      if (newest === null || at > newest.at) {
        newest = { at, tax: { name: data.name.trim().slice(0, MAX_TAX_NAME), pct: data.pct } };
      }
    }
    cache.tax = newest?.tax ?? null;
  } catch {
    // Keep the last tax read.
  }
}

/** The newest info stored on the survey, or null. A failed read (rules not deployed yet) keeps what was read before. */
async function pullInfo(id: string, cache: SurveyCache): Promise<void> {
  try {
    const snapshot = await newestDocs(id, SURVEY_INFO_COLLECTION);
    let newest: { at: number; info: SurveyInfoShare } | null = null;
    for (const d of snapshot.docs) {
      const data = d.data();
      if (!(data.createdAt instanceof Timestamp)) continue;
      const at = data.createdAt.toMillis();
      if (newest !== null && at <= newest.at) continue;
      let location: SurveyInfoShare['location'] = null;
      if (data.locationId !== undefined || data.locationName !== undefined) {
        // A location is a name, with an id unless it was typed as a manual one.
        const { locationId, locationName } = data;
        if (data.locationId !== undefined) {
          if (typeof locationId !== 'number' || !Number.isInteger(locationId) || locationId <= 0) {
            continue;
          }
        }
        if (typeof locationName !== 'string' || locationName.trim() === '') continue;
        location = {
          id: data.locationId === undefined ? null : (locationId as number),
          name: locationName.trim().slice(0, MAX_LOCATION_NAME),
        };
      }
      const notes = typeof data.notes === 'string' ? data.notes.slice(0, MAX_SURVEY_NOTES) : '';
      newest = { at, info: { location, notes } };
    }
    cache.info = newest?.info ?? null;
  } catch {
    // Keep the last info read.
  }
}

/**
 * Merges the ignore docs created since the last pull; for each scan the newest
 * one decides. A failed read keeps what was read before: the scans still load.
 */
async function pullIgnores(id: string, cache: SurveyCache): Promise<void> {
  try {
    const snapshot = await docsSince(id, SURVEY_IGNORES_COLLECTION, cache.ignoresCursor);
    for (const d of snapshot.docs) {
      const data = d.data();
      if (!(data.createdAt instanceof Timestamp)) continue;
      cache.ignoresCursor = laterOf(cache.ignoresCursor, data.createdAt);
      if (typeof data.scanId !== 'string' || typeof data.ignored !== 'boolean') continue;
      const at = data.createdAt.toMillis();
      const seen = cache.ignores.get(data.scanId);
      if (seen === undefined || at > seen.at) {
        cache.ignores.set(data.scanId, { at, ignored: data.ignored });
      }
    }
  } catch {
    // Keep the ignores read before.
  }
}

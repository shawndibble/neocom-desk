// Shared Pops, the Firestore side (issue #6223, ADR 0034). Publishing rebuilds a book's
// `sharedPops/{corporationId}` doc from its Extractions and Pop Sharing settings after every sync
// and every change that moves them; reading checks a viewer's Characters against each pop's
// audiences live (public ESI for corporation and alliance, Member docs for Communities). Both
// collections here are server-only: the rules deny every client, and the one way in is the
// callables. The maths is in sharedPops.ts.

import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { signedInCharacter, type Caller } from './actorAuth.js';
import { chunk } from './chunk.js';
import { BOOKS_COLLECTION, EXTRACTIONS, FEEDERS, META, SCHEDULED_SYNC_DOC } from './corpTaxBook.js';
import { MAX_EXPIRY_HOURS } from './corpTaxBookEngine.js';
import {
  CHARACTER_COMMUNITIES_COLLECTION,
  COMMUNITIES_COLLECTION,
  COMMUNITY_MEMBERS_COLLECTION,
  record,
} from './communities.js';
import { requireAdmin } from './communitiesStore.js';
import { isPlainRecord } from './guards.js';
import { POP_SHARING_DOC, popSharingFrom } from './popSharing.js';
import {
  POP_SHARING_BLOCKS,
  SHARED_POPS,
  SHARED_POP_SOURCES,
  bookRatePctFor,
  buildSharedPops,
  editorStampsFrom,
  qualifyingEditors,
  visiblePops,
  type PopExtraction,
  type RateEntry,
  type SharedPopView,
  type SharedPopsDoc,
} from './sharedPops.js';
import type { AffiliationLookup, CorporationAllianceLookup } from './sharedPopsEsi.js';

type Data = Record<string, unknown>;

/** The book's alliance is re-read at most this often. */
export const ALLIANCE_RECHECK_MS = 6 * 3_600_000;
/** The most of the book's own refinery names one scheduled run looks up. */
export const MAX_REFINERY_NAME_LOOKUPS = 10;
/** A refused or missing refinery name is asked for again after this long. */
export const REFINERY_NAME_RECHECK_MS = 7 * 86_400_000;
/** The most extra Characters one read may prove. */
export const MAX_VIEWER_TOKENS = 50;

export interface SharedPopsDeps {
  db: Firestore;
  now: () => number;
  /** The book corporation's alliance (public ESI); absent keeps the alliance last read. */
  corporationAlliance?: CorporationAllianceLookup;
}

const corpDoc = (db: Firestore, corporationId: number) =>
  db.collection(BOOKS_COLLECTION).doc(String(corporationId));
export const sharedPopsRef = (db: Firestore, corporationId: number) =>
  db.collection(SHARED_POPS).doc(String(corporationId));
export const sharedPopSourcesRef = (db: Firestore, corporationId: number) =>
  db.collection(SHARED_POP_SOURCES).doc(String(corporationId));
const blockRef = (db: Firestore, communityId: string, corporationId: number) =>
  db
    .collection(COMMUNITIES_COLLECTION)
    .doc(communityId)
    .collection(POP_SHARING_BLOCKS)
    .doc(String(corporationId));
const memberDoc = (db: Firestore, communityId: string, characterId: number) =>
  db
    .collection(COMMUNITIES_COLLECTION)
    .doc(communityId)
    .collection(COMMUNITY_MEMBERS_COLLECTION)
    .doc(`char:${characterId}`);

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const recordOf = (v: unknown): Data => (isPlainRecord(v) ? v : {});

function extractionOf(d: DocumentSnapshot): PopExtraction | undefined {
  const x = d.data() ?? {};
  const structureId = num(x.structureId);
  const moonId = num(x.moonId);
  const start = str(x.extractionStartTime);
  const arrival = str(x.chunkArrivalTime);
  const decay = str(x.naturalDecayTime);
  if (structureId === undefined || moonId === undefined || !start || !arrival || !decay)
    return undefined;
  const oreLines = Array.isArray(x.oreLines)
    ? (x.oreLines as Data[]).flatMap((l) =>
        num(l?.typeId) !== undefined && num(l?.quantity) !== undefined
          ? [{ typeId: l.typeId as number, quantity: l.quantity as number }]
          : []
      )
    : undefined;
  return {
    id: d.id,
    structureId,
    moonId,
    extractionStartTime: start,
    chunkArrivalTime: arrival,
    naturalDecayTime: decay,
    ...(str(x.laserFiredAt) ? { laserFiredAt: x.laserFiredAt as string } : {}),
    ...(str(x.cancelledAt) ? { cancelledAt: x.cancelledAt as string } : {}),
    ...(num(x.sourceCorporationId) !== undefined
      ? { sourceCorporationId: x.sourceCorporationId as number }
      : {}),
    ...(oreLines ? { oreLines } : {}),
  };
}

/** Refinery names and systems the book holds: a moon owner's label or structure, its own looked-up names. */
function refineriesOf(
  feeders: readonly DocumentSnapshot[],
  ownNames: Data,
  systemIds: Data
): Map<number, { name: string | null; solarSystemId: number | null }> {
  const out = new Map<number, { name: string | null; solarSystemId: number | null }>();
  for (const [id, v] of Object.entries(ownNames)) {
    const r = recordOf(v);
    out.set(Number(id), {
      name: str(r.name) ?? null,
      solarSystemId: num(r.solarSystemId) ?? num(systemIds[id]) ?? null,
    });
  }
  for (const [id, system] of Object.entries(systemIds))
    if (!out.has(Number(id)))
      out.set(Number(id), { name: null, solarSystemId: num(system) ?? null });
  for (const f of feeders) {
    const d = f.data() ?? {};
    const labels = recordOf(d.refineryLabels);
    const structures = recordOf(d.refineryStructures);
    const systems = recordOf(d.refinerySystems);
    const ids = new Set([
      ...Object.keys(labels),
      ...Object.keys(structures),
      ...Object.keys(systems),
    ]);
    for (const id of ids) {
      const s = recordOf(structures[id]);
      out.set(Number(id), {
        name: str(recordOf(labels[id]).label) ?? str(s.name) ?? null,
        solarSystemId: num(s.solarSystemId) ?? num(systems[id]) ?? null,
      });
    }
  }
  return out;
}

/**
 * Rebuilds the book's Shared Pops: writes the doc, or deletes it when the book publishes nothing,
 * so turning sharing off, an opt-out or a removed audience takes a pop away at once.
 */
export async function publishSharedPops(
  deps: SharedPopsDeps,
  corporationId: number
): Promise<SharedPopsDoc | null> {
  const { db } = deps;
  const now = deps.now();
  const ref = sharedPopsRef(db, corporationId);
  const book = corpDoc(db, corporationId);
  const [bookSnap, sharingSnap, syncSnap, sourcesSnap, held] = await db.getAll(
    book,
    book.collection(META).doc(POP_SHARING_DOC),
    book.collection(META).doc(SCHEDULED_SYNC_DOC),
    sharedPopSourcesRef(db, corporationId),
    ref
  );
  const sharing = popSharingFrom(sharingSnap.data());
  if (!bookSnap.exists || bookSnap.get('active') !== true || !sharing.enabled) {
    if (held.exists) await ref.delete();
    return null;
  }
  const since = new Date(now - MAX_EXPIRY_HOURS * 3_600_000).toISOString();
  const [extractionSnap, feederSnap] = await Promise.all([
    book.collection(EXTRACTIONS).where('naturalDecayTime', '>=', since).get(),
    book.collection(FEEDERS).get(),
  ]);
  const handled = feederSnap.docs.filter((f) => {
    const status = f.get('status');
    return status === 'active' || status === 'pending-removal';
  });
  const owners = new Map(
    handled.map((f) => [Number(f.id), { optedOut: f.get('popSharingOptOut') !== undefined }])
  );

  let allianceId = held.exists ? ((held.get('allianceId') as number | null) ?? null) : null;
  let allianceCheckedAt = num(held.get('allianceCheckedAt')) ?? 0;
  if (deps.corporationAlliance && now - allianceCheckedAt >= ALLIANCE_RECHECK_MS) {
    try {
      allianceId = await deps.corporationAlliance(corporationId);
      allianceCheckedAt = now;
    } catch (e) {
      console.error('book alliance lookup failed', e instanceof Error ? e.message : e);
    }
  }

  const bookData = bookSnap.data() ?? {};
  const rates = (Array.isArray(bookData.rates) ? bookData.rates : []) as RateEntry[];
  const today = new Date(now).toISOString().slice(0, 10);
  const refineries = refineriesOf(
    handled,
    recordOf(sourcesSnap.get('refineries')),
    recordOf(syncSnap.get('systemIds'))
  );
  const doc = buildSharedPops({
    corporationId,
    allianceId,
    sharing,
    extractions: extractionSnap.docs.flatMap((d) => extractionOf(d) ?? []),
    owners,
    expiryHours: recordOf(bookData.structureExpiryHours) as Record<string, number>,
    bookRatePct: (x) => bookRatePctFor(rates, x, today),
    refinery: (id) => refineries.get(id) ?? { name: null, solarSystemId: null },
    syncedAt: num(recordOf(bookData.lastSync).at) ?? null,
    now,
  });
  if (!doc) {
    if (held.exists) await ref.delete();
    return null;
  }
  await ref.set({ ...doc, allianceCheckedAt, updatedAt: FieldValue.serverTimestamp() });
  return doc;
}

/** `publishSharedPops`, best effort: a failure is logged and never fails the sync or edit behind it. */
export async function refreshSharedPops(
  deps: SharedPopsDeps,
  corporationId: number
): Promise<void> {
  try {
    await publishSharedPops(deps, corporationId);
  } catch (e) {
    console.error('shared pops refresh failed', e instanceof Error ? e.message : e);
  }
}

/** The structure name reader the scheduled sync's grant carries (`SyncEsi.structure`). */
export type StructureNameReader = (
  structureId: number
) => Promise<{ kind: 'ok'; name: string; solarSystemId: number } | { kind: string }>;

/**
 * Looks up the names of the book's own refineries that have a live Extraction and no name yet,
 * with the scheduled sync's grant (it carries the structures scope). Only while sharing is on:
 * the names are kept for Shared Pops alone. Best effort.
 */
export async function learnOwnRefineryNames(
  deps: SharedPopsDeps,
  corporationId: number,
  structure: StructureNameReader
): Promise<void> {
  try {
    const { db } = deps;
    const now = deps.now();
    const book = corpDoc(db, corporationId);
    const [sharingSnap, sourcesSnap] = await db.getAll(
      book.collection(META).doc(POP_SHARING_DOC),
      sharedPopSourcesRef(db, corporationId)
    );
    if (!popSharingFrom(sharingSnap.data()).enabled) return;
    const known = recordOf(sourcesSnap.get('refineries'));
    const since = new Date(now - MAX_EXPIRY_HOURS * 3_600_000).toISOString();
    const live = await book.collection(EXTRACTIONS).where('naturalDecayTime', '>=', since).get();
    const ids = [
      ...new Set(
        live.docs
          .filter((d) => d.get('sourceCorporationId') === undefined)
          .map((d) => num(d.get('structureId')))
          .filter((id): id is number => id !== undefined)
      ),
    ].filter((id) => {
      const k = recordOf(known[String(id)]);
      return !str(k.name) && now - (num(k.checkedAt) ?? 0) >= REFINERY_NAME_RECHECK_MS;
    });
    const found: Data = {};
    for (const id of ids.slice(0, MAX_REFINERY_NAME_LOOKUPS)) {
      const read = await structure(id);
      if (read.kind === 'backoff') break;
      found[String(id)] =
        read.kind === 'ok' && 'name' in read
          ? { name: read.name, solarSystemId: read.solarSystemId, checkedAt: now }
          : { checkedAt: now };
    }
    if (Object.keys(found).length > 0)
      await sharedPopSourcesRef(db, corporationId).set({ refineries: found }, { merge: true });
  } catch (e) {
    console.error('refinery name lookup failed', e instanceof Error ? e.message : e);
  }
}

/** Stamps an officer's use of the book with an editing role: the Community officer rule's clock. */
export async function stampEditorUse(
  db: Firestore,
  corporationId: number,
  officer: { characterId: number; ownerHash: string },
  at: number
): Promise<void> {
  await sharedPopSourcesRef(db, corporationId)
    .set(
      {
        editors: {
          [`char:${officer.characterId}`]: {
            characterId: officer.characterId,
            ownerHash: officer.ownerHash,
            usedAt: at,
          },
        },
      },
      { merge: true }
    )
    .catch((e) => console.error('editor stamp failed', e instanceof Error ? e.message : e));
}

/** Stamps a failed role check: the officer stops counting for Community shares until their next editing use. */
export async function stampFailedRoleCheck(
  db: Firestore,
  corporationId: number,
  characterId: number,
  at: number
): Promise<void> {
  const ref = sharedPopSourcesRef(db, corporationId);
  try {
    const held = await ref.get();
    // Nobody to disqualify: no stamp is written for a Character that never edited the book.
    if (!isPlainRecord(recordOf(held.get('editors'))[`char:${characterId}`])) return;
    await ref.set({ editors: { [`char:${characterId}`]: { failedAt: at } } }, { merge: true });
  } catch (e) {
    console.error('failed-check stamp failed', e instanceof Error ? e.message : e);
  }
}

// --- Reading --------------------------------------------------------------------------------

export interface PopViewer {
  characterId: number;
  ownerHash: string;
}

export interface SharedPopsReadDeps {
  db: Firestore;
  now: () => number;
  affiliations: AffiliationLookup;
}

/** The Communities the viewers are current Members of (ownerHash checked, as `isCurrentMember`). */
async function communitiesOf(db: Firestore, viewers: readonly PopViewer[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const v of viewers) {
    const index = await db
      .collection('characters')
      .doc(`char:${v.characterId}`)
      .collection(CHARACTER_COMMUNITIES_COLLECTION)
      .get();
    if (index.empty) continue;
    const members = await db.getAll(...index.docs.map((d) => memberDoc(db, d.id, v.characterId)));
    members.forEach((m, i) => {
      if (m.exists && m.get('ownerHash') === v.ownerHash) out.add(index.docs[i].id);
    });
  }
  return out;
}

/**
 * Which of `communityIds` carry this book's pops now: not blocked by the Community's admin, and
 * an officer of the book (an editing use in the last 30 days, no failed role check since, still
 * in the book's corporation) is a current Member.
 */
export async function sharingCommunities(
  deps: SharedPopsReadDeps,
  corporationId: number,
  communityIds: readonly string[]
): Promise<Map<string, { officer: boolean; blocked: boolean }>> {
  const { db } = deps;
  const out = new Map<string, { officer: boolean; blocked: boolean }>();
  if (communityIds.length === 0) return out;
  const sources = await sharedPopSourcesRef(db, corporationId).get();
  const editors = qualifyingEditors(editorStampsFrom(sources.data()), deps.now());
  const inCorp =
    editors.length === 0
      ? []
      : await deps
          .affiliations(editors.map((e) => e.characterId))
          .then((a) =>
            editors.filter((e) => a.get(e.characterId)?.corporationId === corporationId)
          );
  for (const c of communityIds) {
    const [block, ...members] = await db.getAll(
      blockRef(db, c, corporationId),
      ...inCorp.map((e) => memberDoc(db, c, e.characterId))
    );
    out.set(c, {
      blocked: block.exists,
      officer: members.some((m, i) => m.exists && m.get('ownerHash') === inCorp[i].ownerHash),
    });
  }
  return out;
}

/**
 * Every Shared Pop the viewer's Characters may read now. The server-side read seam: the
 * callable answers a pilot with it, and a notification sweep can use it for a device's Characters.
 */
export async function sharedPopsFor(
  deps: SharedPopsReadDeps,
  viewers: readonly PopViewer[]
): Promise<SharedPopView[]> {
  const { db } = deps;
  const now = deps.now();
  if (viewers.length === 0) return [];
  const affiliations = await deps.affiliations(viewers.map((v) => v.characterId));
  const corporationIds = new Set<number>();
  const allianceIds = new Set<number>();
  for (const a of affiliations.values()) {
    corporationIds.add(a.corporationId);
    if (a.allianceId !== null) allianceIds.add(a.allianceId);
  }
  const memberOf = await communitiesOf(db, viewers);

  const docs = new Map<number, SharedPopsDoc>();
  const keep = (d: DocumentSnapshot) => {
    if (d.exists) docs.set(Number(d.id), d.data() as SharedPopsDoc);
  };
  if (corporationIds.size > 0)
    (await db.getAll(...[...corporationIds].map((id) => sharedPopsRef(db, id)))).forEach(keep);
  for (const ids of chunk([...allianceIds], 30))
    (await db.collection(SHARED_POPS).where('allianceId', 'in', ids).get()).docs.forEach(keep);
  for (const ids of chunk([...memberOf], 30))
    (
      await db.collection(SHARED_POPS).where('communityIds', 'array-contains-any', ids).get()
    ).docs.forEach(keep);

  const out: SharedPopView[] = [];
  for (const doc of docs.values()) {
    const candidates = (doc.communityIds ?? []).filter((c) => memberOf.has(c));
    const status = await sharingCommunities(deps, doc.corporationId, candidates);
    const communityIds = new Set(
      candidates.filter((c) => status.get(c)?.officer && !status.get(c)?.blocked)
    );
    for (const pop of visiblePops(doc, { corporationIds, allianceIds, communityIds }, now)) {
      const view: SharedPopView & { audiences?: string[] } = {
        ...pop,
        corporationId: doc.corporationId,
        syncedAt: doc.syncedAt ?? null,
      };
      // Who else a pop is shared with is the book's business, not the viewer's.
      delete view.audiences;
      out.push(view);
    }
  }
  out.sort((a, b) => a.popAt.localeCompare(b.popAt) || a.id.localeCompare(b.id));
  return out;
}

// --- Callables ------------------------------------------------------------------------------

/** `listSharedPopsCallable` input: access tokens proving the caller's other Characters. */
export function parseListSharedPopsInput(data: unknown): { accessTokens: string[] } {
  const d = record(data ?? {});
  if (d.accessTokens === undefined) return { accessTokens: [] };
  if (
    !Array.isArray(d.accessTokens) ||
    d.accessTokens.length > MAX_VIEWER_TOKENS ||
    !d.accessTokens.every((t) => typeof t === 'string' && t.length > 0)
  ) {
    throw new HttpsError('invalid-argument', 'accessTokens must be a list of access tokens');
  }
  return { accessTokens: d.accessTokens as string[] };
}

/**
 * The signed-in Character plus every other Character whose access token verifies. A token that
 * fails is skipped (one stale alt never hides the rest); it is never stored or logged.
 */
export async function provenViewers(
  caller: Caller,
  accessTokens: readonly string[],
  verify: (accessToken: string) => Promise<{ characterId: number; ownerHash: string }>
): Promise<PopViewer[]> {
  const viewers = new Map<number, PopViewer>();
  viewers.set(signedInCharacter(caller), {
    characterId: signedInCharacter(caller),
    ownerHash: caller.ownerHash,
  });
  const verified = await Promise.allSettled(accessTokens.map((t) => verify(t)));
  for (const v of verified)
    if (v.status === 'fulfilled' && !viewers.has(v.value.characterId))
      viewers.set(v.value.characterId, {
        characterId: v.value.characterId,
        ownerHash: v.value.ownerHash,
      });
  return [...viewers.values()];
}

/** The Communities a book's Pop Sharing settings name (default and every Moon override). */
export async function settingsCommunityIds(
  db: Firestore,
  corporationId: number
): Promise<string[]> {
  const sharing = popSharingFrom(
    (await corpDoc(db, corporationId).collection(META).doc(POP_SHARING_DOC).get()).data()
  );
  const ids = new Set<string>();
  for (const s of [sharing.defaults, ...Object.values(sharing.moons)])
    for (const a of s.audiences ?? []) if (a.kind === 'community') ids.add(a.communityId);
  return [...ids].sort();
}

export interface CommunityPopSharer {
  corporationId: number;
  /** Whether the corporation shares pops into the Community now. */
  sharing: boolean;
  blocked: boolean;
}

/** A Community's admin: the corporations sharing moon pops into it, and the ones they blocked. */
export async function listCommunityPopSharers(
  db: Firestore,
  caller: Caller,
  communityId: string
): Promise<{ sharers: CommunityPopSharer[] }> {
  await requireAdmin(db, communityId, caller);
  const [sharing, blocks] = await Promise.all([
    db.collection(SHARED_POPS).where('communityIds', 'array-contains', communityId).get(),
    db.collection(COMMUNITIES_COLLECTION).doc(communityId).collection(POP_SHARING_BLOCKS).get(),
  ]);
  const byCorp = new Map<number, CommunityPopSharer>();
  for (const d of sharing.docs)
    byCorp.set(Number(d.id), { corporationId: Number(d.id), sharing: true, blocked: false });
  for (const d of blocks.docs) {
    const id = Number(d.id);
    byCorp.set(id, { corporationId: id, sharing: byCorp.has(id), blocked: true });
  }
  return { sharers: [...byCorp.values()].sort((a, b) => a.corporationId - b.corporationId) };
}

export interface CommunityPopBlockInput {
  communityId: string;
  corporationId: number;
  blocked: boolean;
}

export function parseCommunityPopBlockInput(data: unknown): CommunityPopBlockInput {
  const d = record(data);
  if (typeof d.communityId !== 'string' || d.communityId.length === 0)
    throw new HttpsError('invalid-argument', 'communityId is required');
  if (
    typeof d.corporationId !== 'number' ||
    !Number.isSafeInteger(d.corporationId) ||
    d.corporationId < 1
  )
    throw new HttpsError('invalid-argument', 'corporationId must be a corporation id');
  if (typeof d.blocked !== 'boolean')
    throw new HttpsError('invalid-argument', 'blocked must be true or false');
  return { communityId: d.communityId, corporationId: d.corporationId, blocked: d.blocked };
}

/** A Community's admin blocks (or unblocks) a corporation's Shared Pops there; it holds from the next read. */
export async function setCommunityPopBlock(
  db: Firestore,
  caller: Caller,
  input: CommunityPopBlockInput,
  now: number
): Promise<{ ok: true }> {
  await requireAdmin(db, input.communityId, caller);
  const ref = blockRef(db, input.communityId, input.corporationId);
  if (input.blocked) await ref.set({ by: signedInCharacter(caller), at: now });
  else await ref.delete();
  return { ok: true };
}

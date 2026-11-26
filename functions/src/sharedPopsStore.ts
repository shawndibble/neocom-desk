import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { signedInCharacter, type Caller } from './actorAuth.js';
import { chunk } from './chunk.js';
import {
  BOOKS_COLLECTION,
  EXTRACTIONS,
  FEEDERS,
  META,
  OBSERVED,
  SCHEDULED_SYNC_DOC,
} from './corpTaxBook.js';
import { MAX_EXPIRY_HOURS } from './corpTaxBookEngine.js';
import {
  CHARACTER_COMMUNITIES_COLLECTION,
  COMMUNITIES_COLLECTION,
  COMMUNITY_MEMBERS_COLLECTION,
  record,
  utcDayKey,
} from './communities.js';
import { requireAdmin } from './communitiesStore.js';
import { isFiniteNumber, isPlainRecord } from './guards.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';
import { POP_SHARING_DOC, popSharingFrom } from './popSharing.js';
import {
  ALLIANCE_RECHECK_MS,
  POP_RETAIN_MS,
  POP_SHARING_BLOCKS,
  SHARED_POPS,
  SHARED_POP_SOURCES,
  bookAllianceNow,
  bookRatePctFor,
  buildSharedPops,
  currentSharedPops,
  editorStampsFrom,
  movedPops,
  namedCommunityIds,
  qualifyingEditors,
  sharedPopsRepublishDue,
  audienceCharacters,
  visiblePops,
  type PopExtraction,
  type RateEntry,
  type SharedPop,
  type SharedPopView,
  type SharedPopsDoc,
} from './sharedPops.js';
import type { Affiliation, AffiliationLookup, CorporationAllianceLookup } from './sharedPopsEsi.js';
import { PROJECTIONS_COLLECTION } from './projectionStore.js';

type Data = Record<string, unknown>;

export const MAX_REFINERY_NAME_LOOKUPS = 10;
export const REFINERY_NAME_RECHECK_MS = 7 * DAY_MS;
export const MAX_VIEWER_TOKENS = 50;
export const EDITOR_STAMP_EVERY_MS = HOUR_MS;

export interface SharedPopsDeps {
  db: Firestore;
  now: () => number;
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

const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
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
  const survey = str(x.popSurveyId) ?? str(x.surveyId);
  const flag = recordOf(x.fullyMined);
  const fullyMined =
    str(flag.byName) && str(flag.at)
      ? { byName: flag.byName as string, at: flag.at as string }
      : undefined;
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
    ...(survey ? { surveyId: survey } : {}),
    ...(fullyMined ? { fullyMined } : {}),
  };
}

const IN_QUERY_MAX = 30;

async function minedQtyByExtraction(
  book: DocumentReference,
  extractions: readonly PopExtraction[],
  now: number
): Promise<Map<string, number>> {
  const ids = extractions
    .filter(
      (x) =>
        !x.cancelledAt &&
        !x.fullyMined &&
        (x.oreLines?.length ?? 0) > 0 &&
        Date.parse(x.chunkArrivalTime) <= now
    )
    .map((x) => x.id);
  const mined = new Map(ids.map((id) => [id, 0]));
  const snaps = await Promise.all(
    chunk(ids, IN_QUERY_MAX).map((part) =>
      book.collection(OBSERVED).where('extractionId', 'in', part).get()
    )
  );
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const id = str(d.get('extractionId'));
      const quantity = num(d.get('quantity'));
      if (id !== undefined && quantity !== undefined)
        mined.set(id, (mined.get(id) ?? 0) + quantity);
    }
  }
  return mined;
}

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

const isHandledOwner = (f: DocumentSnapshot): boolean => {
  const status = f.get('status');
  return f.exists && (status === 'active' || status === 'pending-removal');
};
const ownersOf = (handled: readonly DocumentSnapshot[]) =>
  new Map(
    handled.map((f) => [Number(f.id), { optedOut: f.get('popSharingOptOut') !== undefined }])
  );

export interface KnownAlliance {
  allianceId?: number | null;
}

export async function publishSharedPops(
  deps: SharedPopsDeps,
  corporationId: number,
  known: KnownAlliance = {}
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
  const active = bookSnap.exists && bookSnap.get('active') === true;
  await indexSharingCommunities(
    sourcesSnap,
    active ? namedCommunityIds(sharing) : [],
    sharedPopSourcesRef(db, corporationId)
  );
  if (!active || !sharing.enabled) {
    if (held.exists) await ref.delete();
    return null;
  }
  const since = new Date(now - MAX_EXPIRY_HOURS * HOUR_MS - POP_RETAIN_MS).toISOString();
  const [extractionSnap, feederSnap] = await Promise.all([
    book.collection(EXTRACTIONS).where('naturalDecayTime', '>=', since).get(),
    book.collection(FEEDERS).get(),
  ]);
  const handled = feederSnap.docs.filter(isHandledOwner);
  const owners = ownersOf(handled);

  let allianceId = held.exists ? ((held.get('allianceId') as number | null) ?? null) : null;
  let allianceCheckedAt = num(held.get('allianceCheckedAt')) ?? 0;
  if (known.allianceId !== undefined) {
    allianceId = known.allianceId;
    allianceCheckedAt = now;
  } else if (deps.corporationAlliance && now - allianceCheckedAt >= ALLIANCE_RECHECK_MS) {
    try {
      allianceId = await deps.corporationAlliance(corporationId);
      allianceCheckedAt = now;
    } catch (e) {
      console.error('book alliance lookup failed', e instanceof Error ? e.message : e);
    }
  }

  const bookData = bookSnap.data() ?? {};
  const rates = (Array.isArray(bookData.rates) ? bookData.rates : []) as RateEntry[];
  const today = utcDayKey(now);
  const refineries = refineriesOf(
    handled,
    recordOf(sourcesSnap.get('refineries')),
    recordOf(syncSnap.get('systemIds'))
  );
  const extractions = extractionSnap.docs.flatMap((d) => extractionOf(d) ?? []);
  const heldPops = held.exists
    ? (held.get('pops') as SharedPopsDoc['pops'] | undefined)
    : undefined;
  const minedQty = await minedQtyByExtraction(book, extractions, now);
  const doc = buildSharedPops({
    corporationId,
    allianceId,
    sharing,
    extractions: extractions.map((x) => {
      const mined = minedQty.get(x.id);
      return mined === undefined ? x : { ...x, minedQty: mined };
    }),
    heldPops,
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
  await cancelStalePopPushes(db, movedPops(heldPops, doc.pops));
  return doc;
}

export const SHARING_COMMUNITY_IDS = 'sharingCommunityIds';

async function indexSharingCommunities(
  sources: DocumentSnapshot,
  ids: string[],
  ref: DocumentReference
): Promise<void> {
  const stored = sources.get(SHARING_COMMUNITY_IDS) as unknown;
  if (Array.isArray(stored) && stored.join('\n') === ids.join('\n')) return;
  if (!Array.isArray(stored) && ids.length === 0) return;
  await ref.set({ [SHARING_COMMUNITY_IDS]: ids }, { merge: true });
}

async function cancelStalePopPushes(
  db: Firestore,
  moved: readonly { id: string; popAtMs: number }[]
): Promise<void> {
  for (const { id, popAtMs } of moved) {
    try {
      const prefix = `sharedMoonPop:${id}:`;
      const rows = await db
        .collection(PROJECTIONS_COLLECTION)
        .where('occurrenceKey', '>=', prefix)
        .where('occurrenceKey', '<', `sharedMoonPop:${id};`)
        .get();
      const stale = rows.docs.filter(
        (d) =>
          d.get('fired') !== true &&
          !String(d.get('occurrenceKey')).startsWith(`${prefix}${popAtMs}:`)
      );
      for (const part of chunk(stale, 400)) {
        const batch = db.batch();
        for (const d of part) batch.delete(d.ref);
        await batch.commit();
      }
    } catch (e) {
      console.error('stale pop push cancel failed', e instanceof Error ? e.message : e);
    }
  }
}

export async function sharedPopsRepublish(
  deps: SharedPopsDeps,
  corporationId: number,
  changed: boolean
): Promise<KnownAlliance | null> {
  let held: { publishedAtMs: number | undefined; allianceId: number | null } | null = null;
  let allianceNow: number | null | undefined;
  try {
    const snap = await sharedPopsRef(deps.db, corporationId).get();
    if (snap.exists) {
      held = {
        publishedAtMs: (
          snap.get('updatedAt') as { toMillis?: () => number } | undefined
        )?.toMillis?.(),
        allianceId: (snap.get('allianceId') as number | null | undefined) ?? null,
      };
      allianceNow = await deps.corporationAlliance?.(corporationId).catch((e: unknown) => {
        console.error('book alliance lookup failed', e instanceof Error ? e.message : e);
        return undefined;
      });
    }
  } catch (e) {
    console.error('shared pops age read failed', e instanceof Error ? e.message : e);
    if (!changed) return null;
  }
  if (!sharedPopsRepublishDue({ changed, held, allianceNow, now: deps.now() })) return null;
  return allianceNow === undefined ? {} : { allianceId: allianceNow };
}

export async function refreshSharedPops(
  deps: SharedPopsDeps,
  corporationId: number,
  known: KnownAlliance = {}
): Promise<void> {
  try {
    await publishSharedPops(deps, corporationId, known);
  } catch (e) {
    console.error('shared pops refresh failed', e instanceof Error ? e.message : e);
  }
}

export type StructureNameReader = (
  structureId: number
) => Promise<{ kind: 'ok'; name: string; solarSystemId: number } | { kind: string }>;

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
    const since = new Date(now - MAX_EXPIRY_HOURS * HOUR_MS).toISOString();
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

export const editorStampFields = (
  officer: { characterId: number; ownerHash: string },
  at: number
) => ({
  editors: {
    [`char:${officer.characterId}`]: {
      characterId: officer.characterId,
      ownerHash: officer.ownerHash,
      usedAt: at,
    },
  },
});

export async function stampEditorUse(
  db: Firestore,
  corporationId: number,
  officer: { characterId: number; ownerHash: string },
  at: number
): Promise<void> {
  const ref = sharedPopSourcesRef(db, corporationId);
  const key = `char:${officer.characterId}`;
  try {
    const held = editorStampsFrom({
      editors: { [key]: recordOf((await ref.get()).get('editors'))[key] },
    })[0];
    if (
      held &&
      held.ownerHash === officer.ownerHash &&
      at - held.usedAt < EDITOR_STAMP_EVERY_MS &&
      (held.failedAt === undefined || held.failedAt < held.usedAt)
    )
      return;
  } catch {}
  await ref
    .set(editorStampFields(officer, at), { merge: true })
    .catch((e) => console.error('editor stamp failed', e instanceof Error ? e.message : e));
}

export const EDITOR_CHECKED_AT = 'editorCheckedAt';

export async function stampEditorUseIfSharing(
  db: Firestore,
  corporationId: number,
  officer: { characterId: number; ownerHash: string },
  at: number,
  officerRecord: { ref: DocumentReference; held: Data | undefined }
): Promise<void> {
  const checkedAt = num(officerRecord.held?.[EDITOR_CHECKED_AT]);
  if (checkedAt !== undefined && at - checkedAt >= 0 && at - checkedAt < EDITOR_STAMP_EVERY_MS)
    return;
  try {
    const settings = await corpDoc(db, corporationId).collection(META).doc(POP_SHARING_DOC).get();
    if (settings.exists) await stampEditorUse(db, corporationId, officer, at);
    await officerRecord.ref.update({ [EDITOR_CHECKED_AT]: at }).catch(() => undefined);
  } catch (e) {
    console.error('editor stamp check failed', e instanceof Error ? e.message : e);
  }
}

export async function stampFailedRoleCheck(
  db: Firestore,
  corporationId: number,
  characterId: number,
  at: number
): Promise<void> {
  const ref = sharedPopSourcesRef(db, corporationId);
  try {
    const held = await ref.get();
    if (!isPlainRecord(recordOf(held.get('editors'))[`char:${characterId}`])) return;
    await ref.set({ editors: { [`char:${characterId}`]: { failedAt: at } } }, { merge: true });
  } catch (e) {
    console.error('failed-check stamp failed', e instanceof Error ? e.message : e);
  }
}

export interface PopViewer {
  characterId: number;
  ownerHash: string;
}

export interface SharedPopsReadDeps {
  db: Firestore;
  now: () => number;
  affiliations: AffiliationLookup;
}

async function communitiesOf(
  db: Firestore,
  viewers: readonly PopViewer[]
): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>();
  await Promise.all(
    viewers.map(async (v) => {
      const index = await db
        .collection('characters')
        .doc(`char:${v.characterId}`)
        .collection(CHARACTER_COMMUNITIES_COLLECTION)
        .get();
      if (index.empty) return;
      const members = await db.getAll(...index.docs.map((d) => memberDoc(db, d.id, v.characterId)));
      const mine = new Set<string>();
      members.forEach((m, i) => {
        if (m.exists && m.get('ownerHash') === v.ownerHash) mine.add(index.docs[i].id);
      });
      out.set(v.characterId, mine);
    })
  );
  return out;
}

async function asSettingsAllowNow(
  db: Firestore,
  docs: Iterable<SharedPopsDoc>
): Promise<SharedPopsDoc[]> {
  const list = [...docs];
  if (list.length === 0) return [];
  const refs = list.map((doc) => {
    const book = corpDoc(db, doc.corporationId);
    const ownerIds = [
      ...new Set(
        doc.pops.flatMap((p) =>
          p.ownerCorporationId !== undefined && p.ownerCorporationId !== doc.corporationId
            ? [p.ownerCorporationId]
            : []
        )
      ),
    ];
    return [
      book,
      book.collection(META).doc(POP_SHARING_DOC),
      ...ownerIds.map((id) => book.collection(FEEDERS).doc(String(id))),
    ];
  });
  const snaps = await db.getAll(...refs.flat());
  const out: SharedPopsDoc[] = [];
  let i = 0;
  for (const [n, doc] of list.entries()) {
    const [bookSnap, sharingSnap, ...feeders] = snaps.slice(i, i + refs[n].length);
    i += refs[n].length;
    const current = currentSharedPops(doc, {
      active: bookSnap.exists && bookSnap.get('active') === true,
      sharing: popSharingFrom(sharingSnap.data()),
      owners: ownersOf(feeders.filter(isHandledOwner)),
    });
    if (current) out.push(current);
  }
  return out;
}

async function withAllianceNow(
  deps: SharedPopsReadDeps,
  docs: SharedPopsDoc[],
  viewers: readonly Affiliation[]
): Promise<SharedPopsDoc[]> {
  const unsettled = docs.filter(
    (d) => d.allianceId !== null && !viewers.some((v) => v.corporationId === d.corporationId)
  );
  let officers: Affiliation[] = [];
  if (unsettled.length > 0) {
    try {
      const sources = await deps.db.getAll(
        ...unsettled.map((d) => sharedPopSourcesRef(deps.db, d.corporationId))
      );
      const ids = [
        ...new Set(sources.flatMap((s) => editorStampsFrom(s.data()).map((e) => e.characterId))),
      ];
      if (ids.length > 0) officers = [...(await deps.affiliations(ids)).values()];
    } catch (e) {
      console.error('book alliance affiliation failed', e instanceof Error ? e.message : e);
    }
  }
  return docs.map((d) => {
    if (d.allianceId === null) return d;
    const allianceId = bookAllianceNow(d.corporationId, d.allianceId, [...viewers, ...officers]);
    return allianceId === d.allianceId
      ? d
      : { ...d, allianceId, allianceShared: allianceId !== null && d.allianceShared };
  });
}

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
          .then((a) => editors.filter((e) => a.get(e.characterId)?.corporationId === corporationId))
          .catch((e: unknown) => {
            console.error('officer affiliation failed', e instanceof Error ? e.message : e);
            return [];
          });
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
  const communitiesByCharacter = await communitiesOf(db, viewers);
  const memberOf = new Set([...communitiesByCharacter.values()].flatMap((s) => [...s]));

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
  const current = await withAllianceNow(deps, await asSettingsAllowNow(db, docs.values()), [
    ...affiliations.values(),
  ]);
  for (const doc of current) {
    const candidates = (doc.communityIds ?? []).filter((c) => memberOf.has(c));
    const status = await sharingCommunities(deps, doc.corporationId, candidates);
    const communityIds = new Set(
      candidates.filter((c) => status.get(c)?.officer && !status.get(c)?.blocked)
    );
    const characters = viewers.map((v) => {
      const a = affiliations.get(v.characterId);
      const mine = communitiesByCharacter.get(v.characterId) ?? new Set<string>();
      return {
        characterId: v.characterId,
        access: {
          corporationIds: new Set(a ? [a.corporationId] : []),
          allianceIds: new Set(a && a.allianceId !== null ? [a.allianceId] : []),
          communityIds: new Set([...mine].filter((c) => communityIds.has(c))),
        },
      };
    });
    for (const pop of visiblePops(doc, { corporationIds, allianceIds, communityIds }, now)) {
      const view: SharedPopView &
        Pick<SharedPop, 'minedPct' | 'minedQty' | 'minedChangedAt'> & {
          audiences?: string[];
          ownerCorporationId?: number;
        } = {
        ...pop,
        corporationId: doc.corporationId,
        syncedAt: doc.syncedAt ?? null,
        viewerCharacterIds: audienceCharacters(doc, pop, characters),
      };
      delete view.audiences;
      delete view.ownerCorporationId;
      delete view.minedPct;
      delete view.minedQty;
      delete view.minedChangedAt;
      out.push(view);
    }
  }
  out.sort((a, b) => a.popAt.localeCompare(b.popAt) || a.id.localeCompare(b.id));
  return out;
}

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
  sharing: boolean;
  blocked: boolean;
}

export async function listCommunityPopSharers(
  deps: SharedPopsReadDeps,
  caller: Caller,
  communityId: string
): Promise<{ sharers: CommunityPopSharer[] }> {
  const { db } = deps;
  await requireAdmin(db, communityId, caller);
  const [indexed, published, blocks] = await Promise.all([
    db
      .collection(SHARED_POP_SOURCES)
      .where(SHARING_COMMUNITY_IDS, 'array-contains', communityId)
      .get(),
    db.collection(SHARED_POPS).where('communityIds', 'array-contains', communityId).get(),
    db.collection(COMMUNITIES_COLLECTION).doc(communityId).collection(POP_SHARING_BLOCKS).get(),
  ]);
  const indexedNow = new Set(indexed.docs.map((d) => d.id));
  const stale = (
    await asSettingsAllowNow(
      db,
      published.docs.filter((d) => !indexedNow.has(d.id)).map((d) => d.data() as SharedPopsDoc)
    )
  ).filter((d) => d.pops.some((p) => p.audiences.includes(`community:${communityId}`)));
  const named = [...indexedNow].map(Number).concat(stale.map((d) => d.corporationId));
  const byCorp = new Map<number, CommunityPopSharer>();
  const statuses = await Promise.all(
    named.map((id) => sharingCommunities(deps, id, [communityId]))
  );
  named.forEach((corporationId, i) => {
    const status = statuses[i].get(communityId);
    byCorp.set(corporationId, {
      corporationId,
      sharing: status?.officer === true,
      blocked: status?.blocked === true,
    });
  });
  for (const d of blocks.docs) {
    const id = Number(d.id);
    if (!byCorp.has(id)) byCorp.set(id, { corporationId: id, sharing: false, blocked: true });
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

const POP_ID = /^([1-9][0-9]{0,15})_.{1,100}$/;
const SHARE_ID = /^[2-9a-hj-kmnp-z]{6}$/;

export function parseLinkSharedPopSurveyInput(data: unknown): { popId: string; surveyId: string } {
  const d = record(data);
  if (typeof d.popId !== 'string' || !POP_ID.test(d.popId))
    throw new HttpsError('invalid-argument', 'popId must be a Shared Pop id');
  if (typeof d.surveyId !== 'string' || !SHARE_ID.test(d.surveyId))
    throw new HttpsError('invalid-argument', 'surveyId must be a Share Link id');
  return { popId: d.popId, surveyId: d.surveyId };
}

export async function linkSharedPopSurvey(
  deps: SharedPopsReadDeps,
  caller: Caller,
  input: { popId: string; surveyId: string }
): Promise<{ linked: true }> {
  const viewer: PopViewer = {
    characterId: signedInCharacter(caller),
    ownerHash: caller.ownerHash,
  };
  const pop = (await sharedPopsFor(deps, [viewer])).find((p) => p.id === input.popId);
  if (!pop) throw new HttpsError('permission-denied', 'That pop is not shared with you');
  const share = await deps.db.collection('shares').doc(input.surveyId).get();
  const expires = (share.get('expiresAt') as { toMillis?: () => number } | undefined)?.toMillis?.();
  if (!share.exists || share.get('type') !== 'survey' || (expires ?? 0) <= deps.now())
    throw new HttpsError('failed-precondition', 'That Survey does not exist');
  const extraction = corpDoc(deps.db, pop.corporationId)
    .collection(EXTRACTIONS)
    .doc(pop.extractionId);
  if (pop.surveyId === input.surveyId) return { linked: true };
  try {
    await extraction.update({ popSurveyId: input.surveyId });
  } catch {
    throw new HttpsError('not-found', 'That pop is gone');
  }
  await refreshSharedPops(deps, pop.corporationId);
  return { linked: true };
}

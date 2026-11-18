// Shared Pops, the Firestore side (issue #6223, ADR 0034). Publishing rebuilds a book's
// `sharedPops/{corporationId}` doc from its Extractions and Pop Sharing settings after every sync
// and every change that moves them; reading checks a viewer's Characters against each pop's
// audiences live (public ESI for corporation and alliance, Member docs for Communities). Both
// collections here are server-only: the rules deny every client, and the one way in is the
// callables. The maths is in sharedPops.ts.

import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
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
  utcDayKey,
} from './communities.js';
import { requireAdmin } from './communitiesStore.js';
import { isFiniteNumber, isPlainRecord } from './guards.js';
import { DAY_MS, HOUR_MS } from './timeConstants.js';
import { POP_SHARING_DOC, popSharingFrom } from './popSharing.js';
import {
  ALLIANCE_RECHECK_MS,
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
  type SharedPopView,
  type SharedPopsDoc,
} from './sharedPops.js';
import type { Affiliation, AffiliationLookup, CorporationAllianceLookup } from './sharedPopsEsi.js';
import { PROJECTIONS_COLLECTION } from './projectionStore.js';

type Data = Record<string, unknown>;

/** The most of the book's own refinery names one scheduled run looks up. */
export const MAX_REFINERY_NAME_LOOKUPS = 10;
/** A refused or missing refinery name is asked for again after this long. */
export const REFINERY_NAME_RECHECK_MS = 7 * DAY_MS;
/** The most extra Characters one read proves; the client sends no more than this. */
export const MAX_VIEWER_TOKENS = 50;
/** An editor's use is stamped again only once the stored one is this old (the window is 30 days). */
export const EDITOR_STAMP_EVERY_MS = HOUR_MS;

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
    // A pilot's own link (a start from the pop) holds until an officer links again, which clears it.
    ...(survey ? { surveyId: survey } : {}),
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

/** A moon owner whose moons the book handles now; the others share nothing. */
const isHandledOwner = (f: DocumentSnapshot): boolean => {
  const status = f.get('status');
  return f.exists && (status === 'active' || status === 'pending-removal');
};
const ownersOf = (handled: readonly DocumentSnapshot[]) =>
  new Map(
    handled.map((f) => [Number(f.id), { optedOut: f.get('popSharingOptOut') !== undefined }])
  );

/** The corporation's alliance a caller already read: `null` is none; `allianceId` absent, unread. */
export interface KnownAlliance {
  allianceId?: number | null;
}

/**
 * Rebuilds the book's Shared Pops: writes the doc, or deletes it when the book publishes nothing,
 * so turning sharing off, an opt-out or a removed audience takes a pop away at once.
 */
export async function publishSharedPops(
  deps: SharedPopsDeps,
  corporationId: number,
  /** The corporation's alliance, already read by the caller: used as is, not re-read. */
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
  const since = new Date(now - MAX_EXPIRY_HOURS * HOUR_MS).toISOString();
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
  const heldPops = held.exists
    ? (held.get('pops') as SharedPopsDoc['pops'] | undefined)
    : undefined;
  await cancelStalePopPushes(db, movedPops(heldPops, doc.pops));
  return doc;
}

/**
 * `sharedPopSources/{corp}.sharingCommunityIds`: the Communities the book's settings name while
 * it shares. Unlike `sharedPops/{corp}`, which goes whenever no pop is live, this lasts between
 * extractions, so a Community's admin always sees (and can block) a corporation sharing into it.
 * Written only when it changes.
 */
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

/**
 * Drops each device's unfired Scheduled Push for a pop whose time moved (an early fracture):
 * its Occurrence Key (`sharedMoonPop:{popId}:{popAtMs}:{lead}`) names the old time, and a device
 * whose app stays closed never uploads the Projection that would replace it, so it would still
 * push at the stale time. The open app's poll tells the new time. Best effort.
 */
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
        // `;` is the character after `:`, so this bounds every key under the prefix.
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

/**
 * Whether this sync republishes the book's Shared Pops (`sharedPopsRepublishDue`), with the
 * corporation's alliance it read for that, so a book that joins an alliance shows its pops there
 * now rather than at the next 6-hourly recheck. Costs the doc's read, and one public ESI read
 * while a doc is held. Null: no republish.
 */
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

/** `publishSharedPops`, best effort: a failure is logged and never fails the sync or edit behind it. */
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

/** The `sharedPopSources` merge that stamps one officer's editing use at `at`. */
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

/** Stamps an officer's use of the book with an editing role: the Community officer rule's clock. */
export async function stampEditorUse(
  db: Firestore,
  corporationId: number,
  officer: { characterId: number; ownerHash: string },
  at: number
): Promise<void> {
  const ref = sharedPopSourcesRef(db, corporationId);
  const key = `char:${officer.characterId}`;
  try {
    // One write an hour at most: every officer call lands here, on one doc per book.
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
  } catch {
    // Unread: stamp anyway.
  }
  await ref
    .set(editorStampFields(officer, at), { merge: true })
    .catch((e) => console.error('editor stamp failed', e instanceof Error ? e.message : e));
}

/** Field on the officer record: when `stampEditorUseIfSharing` last looked (epoch ms). */
export const EDITOR_CHECKED_AT = 'editorCheckedAt';

/**
 * `stampEditorUse` for `authorizeOfficer`, without a read on most calls: once an hour per
 * officer record (`EDITOR_CHECKED_AT`), and only for a book that has Pop Sharing settings: the
 * stamp only decides Community shares, and a book that never set Pop Sharing shares nothing.
 * Turning sharing on stamps the officer who does it (`applyPopSharingEdit`). Best effort.
 */
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
    // The record may be gone (a revoked check) or never written (no book): nothing to remember.
    await officerRecord.ref.update({ [EDITOR_CHECKED_AT]: at }).catch(() => undefined);
  } catch (e) {
    console.error('editor stamp check failed', e instanceof Error ? e.message : e);
  }
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

/**
 * The Communities each viewer is a current Member of (ownerHash checked, as `isCurrentMember`),
 * by Character.
 */
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

/**
 * The docs as each book's settings allow now (`currentSharedPops`): one batched read of every
 * book, its Pop Sharing settings and the moon owners its pops name. Publishing is best effort and
 * can race an edit, so this is what makes an opt-out or turning sharing off take pops away at once.
 */
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

/**
 * Each doc with the book's alliance as it is now (`bookAllianceNow`): from a viewer in the book's
 * corporation, else from the book's officers (one batched affiliation read, cached per Character),
 * else the alliance last published. So a book that left its alliance stops showing there at once.
 */
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
      // Unanswered: the alliance last published stands, as before this check.
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
          .then((a) => editors.filter((e) => a.get(e.characterId)?.corporationId === corporationId))
          // Unanswered: no officer is known to be in the corporation, so no Community counts.
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
    // Each Character on its own access, so the notification reaches only those in an audience.
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
      const view: SharedPopView & { audiences?: string[]; ownerCorporationId?: number } = {
        ...pop,
        corporationId: doc.corporationId,
        syncedAt: doc.syncedAt ?? null,
        viewerCharacterIds: audienceCharacters(doc, pop, characters),
      };
      // Who else a pop is shared with, and whose moon it is, are the book's business.
      delete view.audiences;
      delete view.ownerCorporationId;
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
  /**
   * Whether the corporation's pops reach the Community now, block aside: its settings name the
   * Community and an officer of the book is a Member (the officer rule). False for a blocked
   * corporation whose settings no longer name the Community.
   */
  sharing: boolean;
  blocked: boolean;
}

/**
 * A Community's admin: the corporations whose Pop Sharing names the Community, and the ones
 * they blocked. Listed from the settings' durable index (`sharingCommunityIds`), so a sharer
 * stays listed (and blockable) between extractions, and from the published docs for a book not
 * republished since that index existed. Each reports whether its pops actually reach the
 * Community now (the officer rule), not just whether its settings name it.
 */
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
  // A published doc counts only for a book the index has not caught up with yet.
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

// --- Linking a Survey started from a pop -------------------------------------------------------

const POP_ID = /^([1-9][0-9]{0,15})_.{1,100}$/;
/** A `shares` id: the app's alphabet and length (see `shortStartLink.ts`). */
const SHARE_ID = /^[2-9a-hj-kmnp-z]{6}$/;

/** `linkSharedPopSurveyCallable` input: the pop's id and the Survey (a Share Link id) started from it. */
export function parseLinkSharedPopSurveyInput(data: unknown): { popId: string; surveyId: string } {
  const d = record(data);
  if (typeof d.popId !== 'string' || !POP_ID.test(d.popId))
    throw new HttpsError('invalid-argument', 'popId must be a Shared Pop id');
  if (typeof d.surveyId !== 'string' || !SHARE_ID.test(d.surveyId))
    throw new HttpsError('invalid-argument', 'surveyId must be a Share Link id');
  return { popId: d.popId, surveyId: d.surveyId };
}

/**
 * Links a Survey a pilot started from a Shared Pop's start link back to that pop, so everyone who
 * sees the pop can open it. Only a viewer the pop reaches now may (`sharedPopsFor` is the one
 * audience check); the newest link wins, and an officer's own `linkSurvey` clears it. The Survey
 * must exist. Stored on the Extraction beside the officer's `surveyId`, which this never touches.
 */
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
  if (!share.exists || share.get('type') !== 'survey')
    throw new HttpsError('failed-precondition', 'That Survey does not exist');
  await corpDoc(deps.db, pop.corporationId)
    .collection(EXTRACTIONS)
    .doc(pop.extractionId)
    .update({ popSurveyId: input.surveyId });
  await refreshSharedPops(deps, pop.corporationId);
  return { linked: true };
}

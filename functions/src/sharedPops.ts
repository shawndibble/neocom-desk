// Shared Pops (issue #6223; scope: docs/context/decisions/20261115-122511-corp-tax-book-shares-
// moon-pop-schedules.md; storage: docs/adr/0034-shared-pops-are-a-server-only-read-model-read-
// through-a-callable.md). The pure half: which of a book's Extractions are published, at what Pop
// Time and until when, who may read each one, and the Community officer rule. Firestore and ESI
// stay in sharedPopsStore.ts.

import { DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS } from './corpTaxBookEngine.js';
import {
  audienceKey,
  effectivePopSharing,
  startLinkRatePct,
  type PopSharingDoc,
  type PopTime,
} from './popSharing.js';

// Local: this module is shared with the client project, which cannot reach vettingTypes.ts.
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** `sharedPops/{corporationId}`: one server-only doc per sharing book. */
export const SHARED_POPS = 'sharedPops';
/**
 * `sharedPopSources/{corporationId}`: server-only inputs kept for publishing: the book's
 * last-editor-use stamps (`editors`) and its own refineries' names (`refineries`).
 */
export const SHARED_POP_SOURCES = 'sharedPopSources';
/** `communities/{id}/popSharingBlocks/{corporationId}`: a Community admin's block. */
export const POP_SHARING_BLOCKS = 'popSharingBlocks';

/** An officer counts for a Community share this long after their last editing use of the book. */
export const OFFICER_WINDOW_MS = 30 * DAY_MS;

export interface OreLine {
  typeId: number;
  quantity: number;
}

/** What the builder needs of one stored Extraction. */
export interface PopExtraction {
  id: string;
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
  /** Set on a moon owner's Extraction: that owner's corporation. */
  sourceCorporationId?: number;
  /** The chunk's make-up in units, when known (the stored `oreLines`). */
  oreLines?: readonly OreLine[];
}

/** One published pop. Never carries ISK. */
export interface SharedPop {
  /** `{corporationId}_{extractionId}`: the deep-link id. */
  id: string;
  extractionId: string;
  moonId: number;
  structureId: number;
  /** The refinery's name as the book knows it; null when it knows none. */
  refineryName: string | null;
  solarSystemId: number | null;
  popTime: PopTime;
  /** ISO instant the pop shows: the chunk's arrival or its natural decay, or the actual fracture. */
  popAt: string;
  /** Whether the chunk was already fractured (popAt is then the actual time). */
  fractured: boolean;
  startedAt: string;
  /** ISO instant the belt is Expired: the pop is dropped then. */
  expiresAt: string;
  /** Null when the settings hide the ore make-up, or the book does not know it. */
  ore: OreLine[] | null;
  /**
   * Whether the settings share the ore make-up, so a null `ore` reads as "unknown" rather than
   * "not shared" (issue #6239). Absent from a doc published before it existed.
   */
  oreShared?: boolean;
  notes: string;
  /** The start link's rate. */
  ratePct: number;
  /** `audienceKey`s of who may read it. */
  audiences: string[];
  /**
   * The moon owner's corporation, on a moon owner's pop: a read drops it at once when that owner
   * opts out or the book stops handling it. Absent on the book's own pops, and on a doc published
   * before it existed. Never sent to a viewer.
   */
  ownerCorporationId?: number;
}

/**
 * One Shared Pop as a viewer receives it (`listSharedPopsCallable`): no audience list, plus who
 * shares it and the data's age. The client's read seam is `src/sync/sharedPops.ts`.
 */
export type SharedPopView = Omit<SharedPop, 'audiences' | 'ownerCorporationId'> & {
  /** The book's corporation: the start link's payee, and the filter by sharing corporation. */
  corporationId: number;
  syncedAt: number | null;
  /**
   * Which of the caller's own Characters are in one of the pop's audiences, so the Shared Moon
   * Pop notification goes to those Characters only (issue #6225). Absent from a server deployed
   * before it existed: every Character then counts.
   */
  viewerCharacterIds?: number[];
};

/** The `sharedPops/{corporationId}` doc. */
export interface SharedPopsDoc {
  /** The book's corporation: the Corp audience and the start link's payee. */
  corporationId: number;
  /** The book's corporation's alliance: the Alliance audience. Null outside an alliance. */
  allianceId: number | null;
  /** Whether any pop names the Corp / Alliance audience. */
  corpShared: boolean;
  allianceShared: boolean;
  /** Every Community any pop names, for the array-contains query. */
  communityIds: string[];
  /** Community names as the officers saw them, for the admin's list. */
  communityNames: Record<string, string>;
  pops: SharedPop[];
  /** Epoch ms of the book's last sync, so a viewer sees the data's age. */
  syncedAt: number | null;
}

export interface BuildSharedPopsInput {
  corporationId: number;
  allianceId: number | null;
  sharing: PopSharingDoc;
  extractions: readonly PopExtraction[];
  /** Moon owners whose moons the book handles (active), each with whether it opted out. */
  owners: ReadonlyMap<number, { optedOut: boolean }>;
  /** Per-structure expiry hours (the book's `expiryHours`). */
  expiryHours: Readonly<Record<string, number>>;
  /** The book's own rate for a moon, in percent. */
  bookRatePct: (x: PopExtraction) => number;
  refinery: (structureId: number) => { name: string | null; solarSystemId: number | null };
  syncedAt: number | null;
  /** Epoch ms. */
  now: number;
}

/** When the chunk fractured, or will: the laser shot, else its natural decay. */
const fracturedAt = (x: PopExtraction): string => x.laserFiredAt ?? x.naturalDecayTime;

/**
 * The instant a Shared Pop shows. Ready is the chunk's arrival, Auto-fracture its natural decay;
 * once the laser fired, both move to the actual fracture.
 */
export function popInstant(x: PopExtraction, popTime: PopTime): string {
  if (x.laserFiredAt) return x.laserFiredAt;
  return popTime === 'ready' ? x.chunkArrivalTime : x.naturalDecayTime;
}

/** When the belt is Expired: the fracture plus the refinery's expiry (48 h, at most 96 h). */
export function popExpiresAt(
  x: PopExtraction,
  expiryHours: Readonly<Record<string, number>>
): string {
  const hours = Math.min(
    expiryHours[String(x.structureId)] ?? DEFAULT_EXPIRY_HOURS,
    MAX_EXPIRY_HOURS
  );
  return new Date(Date.parse(fracturedAt(x)) + hours * HOUR_MS).toISOString();
}

/** A pop exists from the Extraction's start until it is Expired; a cancelled one never. */
export function popIsLive(
  x: PopExtraction,
  expiryHours: Readonly<Record<string, number>>,
  now: number
): boolean {
  if (x.cancelledAt) return false;
  const start = Date.parse(x.extractionStartTime);
  const end = Date.parse(popExpiresAt(x, expiryHours));
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start <= now && now < end;
}

/**
 * The book's Shared Pops at `now`, or null when it publishes none (sharing off, every moon
 * blocked, nothing live): the store deletes the doc then, so a pop goes the moment it stops.
 */
export function buildSharedPops(input: BuildSharedPopsInput): SharedPopsDoc | null {
  if (!input.sharing.enabled) return null;
  const pops: SharedPop[] = [];
  const communityNames: Record<string, string> = {};
  for (const x of input.extractions) {
    const owner = x.sourceCorporationId;
    // A moon owner the book no longer handles shares nothing.
    if (owner !== undefined && owner !== input.corporationId && !input.owners.has(owner)) continue;
    const optedOut =
      owner !== undefined && owner !== input.corporationId && input.owners.get(owner)!.optedOut;
    const { settings, shared } = effectivePopSharing(input.sharing, x.moonId, {
      ownerOptedOut: optedOut,
    });
    if (!shared || !popIsLive(x, input.expiryHours, input.now)) continue;
    for (const a of settings.audiences)
      if (a.kind === 'community') communityNames[a.communityId] = a.name;
    const refinery = input.refinery(x.structureId);
    pops.push({
      id: sharedPopId(input.corporationId, x.id),
      extractionId: x.id,
      moonId: x.moonId,
      structureId: x.structureId,
      refineryName: refinery.name,
      solarSystemId: refinery.solarSystemId,
      popTime: settings.popTime,
      popAt: popInstant(x, settings.popTime),
      fractured: x.laserFiredAt !== undefined,
      startedAt: x.extractionStartTime,
      expiresAt: popExpiresAt(x, input.expiryHours),
      ore:
        settings.showOre && x.oreLines && x.oreLines.length > 0
          ? x.oreLines.map((o) => ({ typeId: o.typeId, quantity: o.quantity }))
          : null,
      oreShared: settings.showOre,
      notes: settings.notes,
      ratePct: startLinkRatePct(settings, input.bookRatePct(x)),
      audiences: settings.audiences.map(audienceKey),
      ...(owner !== undefined && owner !== input.corporationId
        ? { ownerCorporationId: owner }
        : {}),
    });
  }
  if (pops.length === 0) return null;
  pops.sort((a, b) => a.popAt.localeCompare(b.popAt) || a.id.localeCompare(b.id));
  const keys = new Set(pops.flatMap((p) => p.audiences));
  return {
    corporationId: input.corporationId,
    allianceId: input.allianceId,
    corpShared: keys.has('corp'),
    allianceShared: input.allianceId !== null && keys.has('alliance'),
    communityIds: Object.keys(communityNames).sort(),
    communityNames,
    pops,
    syncedAt: input.syncedAt,
  };
}

/** What a read checks a published doc against: the book and its settings as they are now. */
export interface BookSharingNow {
  /** Whether the book is active. */
  active: boolean;
  sharing: PopSharingDoc;
  /** Moon owners the book handles now, each with whether it opted out (as `owners` above). */
  owners: ReadonlyMap<number, { optedOut: boolean }>;
}

/**
 * A published doc as the book's settings allow now, or null when they allow nothing. Publishing
 * is best effort and can race an edit, so a read never trusts the doc alone: sharing turned off,
 * an opt-out, a moon owner no longer handled, a blocked moon or a removed audience takes the pop
 * away at once even when the republish that follows failed or was overtaken.
 */
export function currentSharedPops(doc: SharedPopsDoc, book: BookSharingNow): SharedPopsDoc | null {
  if (!book.active || !book.sharing.enabled) return null;
  const pops = doc.pops.flatMap((pop) => {
    const owner = pop.ownerCorporationId;
    const foreign = owner !== undefined && owner !== doc.corporationId;
    if (foreign && !book.owners.has(owner)) return [];
    const { settings, shared } = effectivePopSharing(book.sharing, pop.moonId, {
      ownerOptedOut: foreign && book.owners.get(owner)!.optedOut,
    });
    if (!shared) return [];
    const allowed = new Set(settings.audiences.map(audienceKey));
    const audiences = pop.audiences.filter((a) => allowed.has(a));
    return audiences.length > 0 ? [{ ...pop, audiences }] : [];
  });
  return pops.length > 0 ? { ...doc, pops } : null;
}

export const sharedPopId = (corporationId: number, extractionId: string): string =>
  `${corporationId}_${extractionId}`;

/** What one viewer is, across all their Characters, for one sharing book. */
export interface ViewerAccess {
  corporationIds: ReadonlySet<number>;
  allianceIds: ReadonlySet<number>;
  /** Communities the viewer is a Member of that share this book's pops (officer rule, no block). */
  communityIds: ReadonlySet<string>;
}

/** Whether a viewer is in one of a pop's audiences. Corp and Alliance are the book's own. */
export function inAudience(doc: SharedPopsDoc, pop: SharedPop, viewer: ViewerAccess): boolean {
  return pop.audiences.some((key) => {
    if (key === 'corp') return viewer.corporationIds.has(doc.corporationId);
    if (key === 'alliance')
      return doc.allianceId !== null && viewer.allianceIds.has(doc.allianceId);
    return key.startsWith('community:') && viewer.communityIds.has(key.slice('community:'.length));
  });
}

/** The caller's Characters that are in one of a pop's audiences, each judged on its own access. */
export function audienceCharacters(
  doc: SharedPopsDoc,
  pop: SharedPop,
  characters: readonly { characterId: number; access: ViewerAccess }[]
): number[] {
  return characters.filter((c) => inAudience(doc, pop, c.access)).map((c) => c.characterId);
}

/** The pops of one book a viewer may read, still live at `now`. */
export function visiblePops(doc: SharedPopsDoc, viewer: ViewerAccess, now: number): SharedPop[] {
  return doc.pops.filter((p) => Date.parse(p.expiresAt) > now && inAudience(doc, p, viewer));
}

/** One officer's last editing use of a book, and their last failed role check. */
export interface EditorStamp {
  characterId: number;
  ownerHash: string;
  /** Epoch ms of the last use of the book with an editing role. */
  usedAt: number;
  /** Epoch ms of the last failed role check, if any. */
  failedAt?: number;
}

/**
 * The book's officers who count for a Community share: an editing use in the last 30 days and
 * no failed role check since. The caller still checks each is in the book's corporation now.
 */
export function qualifyingEditors(stamps: readonly EditorStamp[], now: number): EditorStamp[] {
  return stamps.filter(
    (s) => s.usedAt > now - OFFICER_WINDOW_MS && (s.failedAt === undefined || s.failedAt < s.usedAt)
  );
}

/** A stored `sharedPopSources` doc's `editors` as stamps, dropping what it cannot read. */
export function editorStampsFrom(raw: unknown): EditorStamp[] {
  const editors = (raw as { editors?: unknown } | undefined)?.editors;
  if (typeof editors !== 'object' || editors === null) return [];
  const out: EditorStamp[] = [];
  for (const v of Object.values(editors as Record<string, unknown>)) {
    const s = v as Partial<EditorStamp> | null;
    if (
      !s ||
      typeof s.characterId !== 'number' ||
      typeof s.ownerHash !== 'string' ||
      typeof s.usedAt !== 'number'
    )
      continue;
    out.push({
      characterId: s.characterId,
      ownerHash: s.ownerHash,
      usedAt: s.usedAt,
      ...(typeof s.failedAt === 'number' ? { failedAt: s.failedAt } : {}),
    });
  }
  return out;
}

/** The rates the book stores (`StoredRate` in corpTaxBook.ts), as far as a start link reads them. */
export interface RateEntry {
  scope: string;
  pct: number;
  effectiveFrom?: string;
  moonId?: number;
  structureId?: number;
  feederId?: number;
}

/**
 * The book's rate for a moon's start link today: the moon's own rate, else its refinery's,
 * else (a moon owner's moon) that owner's, else the corporation rate. Each the latest in force.
 */
export function bookRatePctFor(
  rates: readonly RateEntry[],
  pull: { moonId: number; structureId: number; sourceCorporationId?: number },
  today: string
): number {
  const latest = (match: (r: RateEntry) => boolean): number | undefined => {
    let best: RateEntry | undefined;
    for (const r of rates) {
      if (!match(r) || typeof r.pct !== 'number') continue;
      const from = r.effectiveFrom ?? '';
      if (from > today) continue;
      if (!best || from >= (best.effectiveFrom ?? '')) best = r;
    }
    return best?.pct;
  };
  return (
    latest((r) => r.scope === 'moon' && r.moonId === pull.moonId) ??
    latest((r) => r.scope === 'structure' && r.structureId === pull.structureId) ??
    (pull.sourceCorporationId === undefined
      ? undefined
      : latest((r) => r.scope === 'feeder' && r.feederId === pull.sourceCorporationId)) ??
    latest((r) => r.scope === 'corp') ??
    0
  );
}

/**
 * The pops whose time moved since the doc last published, with the new time: chiefly a chunk
 * the laser fractured early, whose Pop Time drops back to the actual fracture. A Scheduled Push
 * already projected for the old time is then stale (its Occurrence Key names that time).
 */
export function movedPops(
  held: readonly SharedPop[] | undefined,
  next: readonly SharedPop[]
): { id: string; popAtMs: number }[] {
  const before = new Map((held ?? []).map((p) => [p.id, p.popAt]));
  return next.flatMap((p) => {
    const was = before.get(p.id);
    return was === undefined || was === p.popAt ? [] : [{ id: p.id, popAtMs: Date.parse(p.popAt) }];
  });
}

/**
 * The book's alliance now, read off the affiliation of any Character in its corporation (a
 * viewer or an officer the read already looks up), so a book that left its alliance stops
 * showing there at once rather than at the next republish. With no such Character, the alliance
 * last published (re-read every 6 h at most).
 */
export function bookAllianceNow(
  corporationId: number,
  stored: number | null,
  affiliations: Iterable<{ corporationId: number; allianceId: number | null }>
): number | null {
  for (const a of affiliations) if (a.corporationId === corporationId) return a.allianceId;
  return stored;
}

/** The Communities the settings name (default and every Moon override), or none while off. */
export function namedCommunityIds(sharing: PopSharingDoc): string[] {
  if (!sharing.enabled) return [];
  const ids = new Set<string>();
  for (const s of [sharing.defaults, ...Object.values(sharing.moons)])
    for (const a of s.audiences ?? []) if (a.kind === 'community') ids.add(a.communityId);
  return [...ids].sort();
}

import { DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS } from './corpTaxBookEngine.js';
import {
  audienceKey,
  effectivePopSharing,
  startLinkRatePct,
  type PopSharingDoc,
  type PopTime,
} from './popSharing.js';
import { DAY_MS, HOUR_MS, MINUTE_MS } from './timeConstants.js';

export const SHARED_POPS = 'sharedPops';
export const SHARED_POP_SOURCES = 'sharedPopSources';
export const POP_SHARING_BLOCKS = 'popSharingBlocks';

export const POP_RETAIN_MS = 3 * DAY_MS;
export const LIKELY_MINED_OUT_PCT = 90;
export const MINED_QUIET_MS = 30 * MINUTE_MS;

export const OFFICER_WINDOW_MS = 30 * DAY_MS;

export interface OreLine {
  typeId: number;
  quantity: number;
}

export interface PopExtraction {
  id: string;
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
  sourceCorporationId?: number;
  oreLines?: readonly OreLine[];
  surveyId?: string;
  fullyMined?: { byName: string; at: string };
  minedQty?: number;
}

export interface SharedPop {
  id: string;
  extractionId: string;
  moonId: number;
  structureId: number;
  refineryName: string | null;
  solarSystemId: number | null;
  popTime: PopTime;
  popAt: string;
  readyAt?: string;
  autoFractureAt?: string;
  fractured: boolean;
  startedAt: string;
  expiresAt: string;
  retainUntil?: string;
  fullyMined?: { byName: string; at: string };
  minedPct?: number;
  minedQty?: number;
  minedChangedAt?: number;
  likelyMinedOut?: boolean;
  ore: OreLine[] | null;
  oreShared?: boolean;
  notes: string;
  surveyId?: string;
  ratePct: number;
  audiences: string[];
  ownerCorporationId?: number;
}

export type SharedPopView = Omit<
  SharedPop,
  'audiences' | 'ownerCorporationId' | 'minedPct' | 'minedQty' | 'minedChangedAt'
> & {
  corporationId: number;
  syncedAt: number | null;
  viewerCharacterIds?: number[];
};

export interface SharedPopsDoc {
  corporationId: number;
  allianceId: number | null;
  corpShared: boolean;
  allianceShared: boolean;
  communityIds: string[];
  communityNames: Record<string, string>;
  pops: SharedPop[];
  syncedAt: number | null;
}

export interface BuildSharedPopsInput {
  corporationId: number;
  allianceId: number | null;
  sharing: PopSharingDoc;
  extractions: readonly PopExtraction[];
  owners: ReadonlyMap<number, { optedOut: boolean }>;
  expiryHours: Readonly<Record<string, number>>;
  bookRatePct: (x: PopExtraction) => number;
  refinery: (structureId: number) => { name: string | null; solarSystemId: number | null };
  syncedAt: number | null;
  heldPops?: readonly SharedPop[];
  now: number;
}

const fracturedAt = (x: PopExtraction): string => x.laserFiredAt ?? x.naturalDecayTime;

export function popInstant(x: PopExtraction, popTime: PopTime): string {
  if (x.laserFiredAt) return x.laserFiredAt;
  return popTime === 'ready' ? x.chunkArrivalTime : x.naturalDecayTime;
}

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

export function popIsRetained(
  x: PopExtraction,
  expiryHours: Readonly<Record<string, number>>,
  now: number
): boolean {
  if (x.cancelledAt) return false;
  const start = Date.parse(x.extractionStartTime);
  const end = Date.parse(popExpiresAt(x, expiryHours));
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start <= now && now < end + POP_RETAIN_MS;
}

function miningState(
  x: PopExtraction,
  held: SharedPop | undefined,
  now: number
): Pick<SharedPop, 'minedPct' | 'minedQty' | 'minedChangedAt' | 'likelyMinedOut'> {
  const chunk = (x.oreLines ?? []).reduce((sum, l) => sum + l.quantity, 0);
  if (x.minedQty === undefined || chunk <= 0) return {};
  const minedPct = Math.round((x.minedQty / chunk) * 100);
  const minedChangedAt =
    held?.minedQty === x.minedQty && held.minedChangedAt !== undefined ? held.minedChangedAt : now;
  const likely =
    !x.fullyMined && minedPct >= LIKELY_MINED_OUT_PCT && now - minedChangedAt >= MINED_QUIET_MS;
  return {
    minedPct,
    minedQty: x.minedQty,
    minedChangedAt,
    ...(likely ? { likelyMinedOut: true } : {}),
  };
}

export function buildSharedPops(input: BuildSharedPopsInput): SharedPopsDoc | null {
  if (!input.sharing.enabled) return null;
  const pops: SharedPop[] = [];
  const communityNames: Record<string, string> = {};
  for (const x of input.extractions) {
    const owner = x.sourceCorporationId;
    if (owner !== undefined && owner !== input.corporationId && !input.owners.has(owner)) continue;
    const optedOut =
      owner !== undefined && owner !== input.corporationId && input.owners.get(owner)!.optedOut;
    const { settings, shared } = effectivePopSharing(input.sharing, x.moonId, {
      ownerOptedOut: optedOut,
    });
    if (!shared || !popIsRetained(x, input.expiryHours, input.now)) continue;
    for (const a of settings.audiences)
      if (a.kind === 'community') communityNames[a.communityId] = a.name;
    const refinery = input.refinery(x.structureId);
    const id = sharedPopId(input.corporationId, x.id);
    pops.push({
      id,
      extractionId: x.id,
      moonId: x.moonId,
      structureId: x.structureId,
      refineryName: refinery.name,
      solarSystemId: refinery.solarSystemId,
      popTime: settings.popTime,
      popAt: popInstant(x, settings.popTime),
      readyAt: popInstant(x, 'ready'),
      autoFractureAt: popInstant(x, 'auto-fracture'),
      fractured: x.laserFiredAt !== undefined,
      startedAt: x.extractionStartTime,
      expiresAt: popExpiresAt(x, input.expiryHours),
      retainUntil: new Date(
        Date.parse(popExpiresAt(x, input.expiryHours)) + POP_RETAIN_MS
      ).toISOString(),
      ...(x.fullyMined ? { fullyMined: x.fullyMined } : {}),
      ...miningState(
        x,
        input.heldPops?.find((p) => p.id === id),
        input.now
      ),
      ore:
        settings.showOre && x.oreLines && x.oreLines.length > 0
          ? x.oreLines.map((o) => ({ typeId: o.typeId, quantity: o.quantity }))
          : null,
      oreShared: settings.showOre,
      notes: settings.notes,
      ...(x.surveyId && settings.showOre ? { surveyId: x.surveyId } : {}),
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

export interface BookSharingNow {
  active: boolean;
  sharing: PopSharingDoc;
  owners: ReadonlyMap<number, { optedOut: boolean }>;
}

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

export interface ViewerAccess {
  corporationIds: ReadonlySet<number>;
  allianceIds: ReadonlySet<number>;
  communityIds: ReadonlySet<string>;
}

export function inAudience(doc: SharedPopsDoc, pop: SharedPop, viewer: ViewerAccess): boolean {
  return pop.audiences.some((key) => {
    if (key === 'corp') return viewer.corporationIds.has(doc.corporationId);
    if (key === 'alliance')
      return doc.allianceId !== null && viewer.allianceIds.has(doc.allianceId);
    return key.startsWith('community:') && viewer.communityIds.has(key.slice('community:'.length));
  });
}

export function audienceCharacters(
  doc: SharedPopsDoc,
  pop: SharedPop,
  characters: readonly { characterId: number; access: ViewerAccess }[]
): number[] {
  return characters.filter((c) => inAudience(doc, pop, c.access)).map((c) => c.characterId);
}

export function visiblePops(doc: SharedPopsDoc, viewer: ViewerAccess, now: number): SharedPop[] {
  return doc.pops.filter(
    (p) => Date.parse(p.retainUntil ?? p.expiresAt) > now && inAudience(doc, p, viewer)
  );
}

export interface EditorStamp {
  characterId: number;
  ownerHash: string;
  usedAt: number;
  failedAt?: number;
}

export function qualifyingEditors(stamps: readonly EditorStamp[], now: number): EditorStamp[] {
  return stamps.filter(
    (s) => s.usedAt > now - OFFICER_WINDOW_MS && (s.failedAt === undefined || s.failedAt < s.usedAt)
  );
}

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

export interface RateEntry {
  scope: string;
  pct: number;
  effectiveFrom?: string;
  moonId?: number;
  structureId?: number;
  feederId?: number;
}

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

export const ALLIANCE_RECHECK_MS = 6 * HOUR_MS;

export function sharedPopsRepublishDue(input: {
  changed: boolean;
  held: { publishedAtMs: number | undefined; allianceId: number | null } | null;
  allianceNow?: number | null;
  now: number;
}): boolean {
  const { changed, held, allianceNow, now } = input;
  if (changed) return true;
  if (held === null) return false;
  if (allianceNow !== undefined && allianceNow !== held.allianceId) return true;
  return held.publishedAtMs === undefined || now - held.publishedAtMs >= ALLIANCE_RECHECK_MS;
}

export function bookAllianceNow(
  corporationId: number,
  stored: number | null,
  affiliations: Iterable<{ corporationId: number; allianceId: number | null }>
): number | null {
  for (const a of affiliations) if (a.corporationId === corporationId) return a.allianceId;
  return stored;
}

export function namedCommunityIds(sharing: PopSharingDoc): string[] {
  if (!sharing.enabled) return [];
  const ids = new Set<string>();
  for (const s of [sharing.defaults, ...Object.values(sharing.moons)])
    for (const a of s.audiences ?? []) if (a.kind === 'community') ids.add(a.communityId);
  return [...ids].sort();
}

import { severityForRemaining, type DeadlineSeverity } from '../character/severity';
import { raidState, type SovereigntyKind } from './sovereignty';

export const CORP_BOARD_ITEM_KINDS = [
  'structureTimer',
  'sovRaid',
  'structureFuel',
  'sovHubFuel',
  'moonExtraction',
  'jobDelivery',
  'serviceOffline',
] as const;

export type CorpBoardItemKind = (typeof CORP_BOARD_ITEM_KINDS)[number];

export type CorpBoardSeverity = DeadlineSeverity;

export type CorpBoardTiming = 'timed' | 'passed' | 'untimed';

export interface CorpBoardItem {
  id: string;
  kind: CorpBoardItemKind;
  subject: string;
  detail: string;
  deadlineMs: number | null;
  remainingMs: number | null;
  timing: CorpBoardTiming;
  severity: CorpBoardSeverity;
  typeId: number | null;
  withinStaleWindow: boolean;
  corporationId?: number;
}

export interface BoardStructureSource {
  structureId: number;
  name: string;
  fuelExpiresMs: number | null;
  state: string | null;
  stateTimerEndMs: number | null;
  unanchorsAtMs: number | null;
  services: readonly BoardStructureService[];
  corporationId?: number;
  systemId?: number;
  typeId?: number;
}

export interface BoardStructureService {
  name: string;
  state: 'online' | 'offline' | 'cleanup';
}

export interface BoardStarbaseSource {
  starbaseId: number;
  name: string;
  fuelExpiresMs: number | null;
  reinforcedUntilMs: number | null;
  unanchorsAtMs: number | null;
}

export interface BoardSovereigntySource {
  id: string;
  name: string;
  kind: SovereigntyKind;
  startMs: number;
  endMs: number;
}

export interface BoardHubFuelSource {
  id: string;
  name: string;
  runsOutMs: number;
}

export interface BoardExtractionSource {
  structureId: number;
  subject: string;
  chunkArrivalMs: number;
  naturalDecayMs: number;
}

export interface BoardJobSource {
  jobId: number;
  subject: string;
  endMs: number;
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted';
  typeId: number | null;
}

export interface CorpBoardSources {
  nowMs: number;
  staleWindowMs: number;
  structures?: readonly BoardStructureSource[];
  starbases?: readonly BoardStarbaseSource[];
  sovereignty?: readonly BoardSovereigntySource[];
  hubFuel?: readonly BoardHubFuelSource[];
  extractions?: readonly BoardExtractionSource[];
  jobs?: readonly BoardJobSource[];
  includeRunningJobs?: boolean;
}

export { severityForRemaining };

type ItemBase = Pick<CorpBoardItem, 'id' | 'kind' | 'subject' | 'detail' | 'typeId'>;

function timedItem(
  base: ItemBase,
  deadlineMs: number,
  { nowMs, staleWindowMs }: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem {
  const remainingMs = deadlineMs - nowMs;
  return {
    ...base,
    deadlineMs,
    remainingMs,
    timing: 'timed',
    severity: severityForRemaining(remainingMs, 'logistics'),
    withinStaleWindow: remainingMs > 0 && remainingMs < staleWindowMs,
  };
}

function clocklessItem(base: ItemBase, timing: 'passed' | 'untimed'): CorpBoardItem {
  return {
    ...base,
    deadlineMs: null,
    remainingMs: null,
    timing,
    severity: timing === 'passed' ? 'critical' : severityForRemaining(null),
    withinStaleWindow: false,
  };
}

function structureItems(
  structure: BoardStructureSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem[] {
  const items: CorpBoardItem[] = [];
  const { structureId, name } = structure;

  const fuel: ItemBase = {
    id: `fuel:${structureId}`,
    kind: 'structureFuel',
    subject: name,
    detail: '',
    typeId: null,
  };
  items.push(
    structure.fuelExpiresMs === null
      ? clocklessItem(fuel, 'passed')
      : timedItem(fuel, structure.fuelExpiresMs, clock)
  );

  if (structure.stateTimerEndMs !== null) {
    items.push(
      timedItem(
        {
          id: `state:${structureId}`,
          kind: 'structureTimer',
          subject: name,
          detail: structure.state ?? 'unknown',
          typeId: null,
        },
        structure.stateTimerEndMs,
        clock
      )
    );
  }

  if (structure.unanchorsAtMs !== null) {
    items.push(
      timedItem(
        {
          id: `unanchor:${structureId}`,
          kind: 'structureTimer',
          subject: name,
          detail: 'unanchoring',
          typeId: null,
        },
        structure.unanchorsAtMs,
        clock
      )
    );
  }

  for (const service of structure.services) {
    if (service.state !== 'offline') continue;
    items.push(
      clocklessItem(
        {
          id: `service:${structureId}:${service.name}`,
          kind: 'serviceOffline',
          subject: name,
          detail: service.name,
          typeId: null,
        },
        'untimed'
      )
    );
  }

  return items;
}

function starbaseItems(
  starbase: BoardStarbaseSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem[] {
  const items: CorpBoardItem[] = [];
  const { starbaseId, name } = starbase;
  const base = (prefix: string, kind: CorpBoardItemKind, detail: string): ItemBase => ({
    id: `${prefix}:sb${starbaseId}`,
    kind,
    subject: name,
    detail,
    typeId: null,
  });
  if (starbase.fuelExpiresMs !== null) {
    items.push(timedItem(base('fuel', 'structureFuel', ''), starbase.fuelExpiresMs, clock));
  }
  if (starbase.reinforcedUntilMs !== null) {
    items.push(
      timedItem(base('state', 'structureTimer', 'reinforced'), starbase.reinforcedUntilMs, clock)
    );
  }
  if (starbase.unanchorsAtMs !== null) {
    items.push(
      timedItem(base('unanchor', 'structureTimer', 'unanchoring'), starbase.unanchorsAtMs, clock)
    );
  }
  return items;
}

function sovereigntyItems(
  raid: BoardSovereigntySource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem[] {
  const state = raidState(raid, clock.nowMs, raid.kind);
  if (state === 'closed') return [];
  return [
    timedItem(
      {
        id: `sov:${raid.id}`,
        kind: 'sovRaid',
        subject: raid.name,
        detail: `${raid.kind}.${state}`,
        typeId: null,
      },
      state === 'upcoming' ? raid.startMs : raid.endMs,
      clock
    ),
  ];
}

function extractionItem(
  extraction: BoardExtractionSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem | null {
  if (clock.nowMs >= extraction.naturalDecayMs) return null;
  const arrived = clock.nowMs >= extraction.chunkArrivalMs;
  return timedItem(
    {
      id: `moon:${extraction.structureId}`,
      kind: 'moonExtraction',
      subject: extraction.subject,
      detail: arrived ? 'decay' : 'arrival',
      typeId: null,
    },
    arrived ? extraction.naturalDecayMs : extraction.chunkArrivalMs,
    clock
  );
}

function jobItem(
  job: BoardJobSource,
  clock: Pick<CorpBoardSources, 'nowMs' | 'staleWindowMs'>
): CorpBoardItem {
  return timedItem(
    {
      id: `job:${job.jobId}`,
      kind: 'jobDelivery',
      subject: job.subject,
      detail: '',
      typeId: job.typeId,
    },
    job.endMs,
    clock
  );
}

function sortKey(item: CorpBoardItem): number {
  if (item.timing === 'passed') return Number.NEGATIVE_INFINITY;
  if (item.timing === 'untimed') return Number.POSITIVE_INFINITY;
  return item.deadlineMs ?? Number.POSITIVE_INFINITY;
}

const KIND_RANK = new Map(CORP_BOARD_ITEM_KINDS.map((kind, index) => [kind, index]));

export function buildCorpBoard(sources: CorpBoardSources): CorpBoardItem[] {
  const clock = { nowMs: sources.nowMs, staleWindowMs: sources.staleWindowMs };
  const items: CorpBoardItem[] = [];

  for (const structure of sources.structures ?? []) items.push(...structureItems(structure, clock));
  for (const starbase of sources.starbases ?? []) items.push(...starbaseItems(starbase, clock));
  for (const raid of sources.sovereignty ?? []) items.push(...sovereigntyItems(raid, clock));
  for (const hub of sources.hubFuel ?? []) {
    items.push(
      timedItem(
        {
          id: `fuel:${hub.id}`,
          kind: 'sovHubFuel',
          subject: hub.name,
          detail: '',
          typeId: null,
        },
        hub.runsOutMs,
        clock
      )
    );
  }
  for (const extraction of sources.extractions ?? []) {
    const item = extractionItem(extraction, clock);
    if (item) items.push(item);
  }
  for (const job of sources.jobs ?? []) {
    const stillOpen = job.status === 'ready' || job.status === 'active';
    if (!stillOpen) continue;
    const running = job.status !== 'ready' && clock.nowMs < job.endMs;
    if (running && !sources.includeRunningJobs) continue;
    items.push(jobItem(job, clock));
  }

  return items.sort(byBoardOrder);
}

function byBoardOrder(a: CorpBoardItem, b: CorpBoardItem): number {
  const byDeadline = sortKey(a) - sortKey(b);
  if (byDeadline !== 0 && !Number.isNaN(byDeadline)) return byDeadline;
  const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
  if (byKind !== 0) return byKind;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function mergeCorpBoards(
  boards: readonly { corporationId: number; items: readonly CorpBoardItem[] }[]
): CorpBoardItem[] {
  return boards
    .flatMap(({ corporationId, items }) =>
      items.map((item) => ({ ...item, id: `${corporationId}:${item.id}`, corporationId }))
    )
    .sort(byBoardOrder);
}

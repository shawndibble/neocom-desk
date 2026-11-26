export const CHARACTER_BOARD_ITEM_KINDS = [
  'calendarEvent',
  'skillTraining',
  'accelerator',
  'industryJob',
  'planetExtraction',
  'mercenaryDen',
  'structureTimer',
  'structureFuel',
  'moonChunk',
  'sharedMoonPop',
  'corpJob',
  'skyhookRaid',
  'contractExpiry',
  'orderExpiry',
] as const;

export type CharacterBoardItemKind = (typeof CHARACTER_BOARD_ITEM_KINDS)[number];

export type CalendarResponse = 'declined' | 'not_responded' | 'accepted' | 'tentative';

export interface BoardCorporation {
  id: number;
  name: string;
  ticker: string;
}

export interface BoardClockSource {
  id: string;
  subject: string;
  detail: string;
  deadlineMs: number;
  corporation?: BoardCorporation;
  characterName?: string;
  sharedBy?: BoardCorporation;
  extra?: { detail: string; atMs?: number };
  pastLabelKey?: string;
  muted?: boolean;
  detailId?: string;
}

export interface BoardCalendarEventSource extends BoardClockSource {
  response: CalendarResponse;
  important: boolean;
}

export interface CharacterBoardItem extends BoardClockSource {
  id: string;
  sourceId: string;
  kind: CharacterBoardItemKind;
  remainingMs: number;
  response: CalendarResponse | null;
  important: boolean;
}

export interface CharacterBoardSources {
  nowMs: number;
  calendarEvents?: readonly BoardCalendarEventSource[];
  skillTraining?: readonly BoardClockSource[];
  industryJobs?: readonly BoardClockSource[];
  planetExtractions?: readonly BoardClockSource[];
  mercenaryDens?: readonly BoardClockSource[];
  moonChunks?: readonly BoardClockSource[];
  sharedMoonPops?: readonly BoardClockSource[];
  structureFuel?: readonly BoardClockSource[];
  structureTimers?: readonly BoardClockSource[];
  corpJobs?: readonly BoardClockSource[];
  skyhookRaids?: readonly BoardClockSource[];
  contractExpiries?: readonly BoardClockSource[];
  orderExpiries?: readonly BoardClockSource[];
  accelerator?: readonly BoardClockSource[];
}

const SOURCE_KEY = {
  calendarEvent: 'calendarEvents',
  skillTraining: 'skillTraining',
  accelerator: 'accelerator',
  industryJob: 'industryJobs',
  planetExtraction: 'planetExtractions',
  mercenaryDen: 'mercenaryDens',
  structureTimer: 'structureTimers',
  structureFuel: 'structureFuel',
  moonChunk: 'moonChunks',
  sharedMoonPop: 'sharedMoonPops',
  corpJob: 'corpJobs',
  skyhookRaid: 'skyhookRaids',
  contractExpiry: 'contractExpiries',
  orderExpiry: 'orderExpiries',
} as const satisfies Record<CharacterBoardItemKind, keyof CharacterBoardSources>;

const KIND_RANK = new Map<CharacterBoardItemKind, number>(
  CHARACTER_BOARD_ITEM_KINDS.map((kind, index) => [kind, index])
);

export function pastDeadlineLabelKey(kind: CharacterBoardItemKind): string {
  if (kind === 'calendarEvent') return 'calendar.started';
  if (kind === 'industryJob') return 'calendar.detail.industryJob.ready';
  if (kind === 'corpJob') return 'calendar.detail.corpJob.ready';
  return 'calendar.overdue';
}

function isCalendarEvent(source: BoardClockSource): source is BoardCalendarEventSource {
  return 'response' in source;
}

function toItem(
  source: BoardClockSource,
  kind: CharacterBoardItemKind,
  nowMs: number
): CharacterBoardItem {
  const remainingMs = source.deadlineMs - nowMs;
  return {
    id: `${kind}:${source.id}`,
    sourceId: source.id,
    kind,
    subject: source.subject,
    detail: source.detail,
    deadlineMs: source.deadlineMs,
    remainingMs,
    response: isCalendarEvent(source) ? source.response : null,
    important: isCalendarEvent(source) ? source.important : false,
    ...(source.corporation ? { corporation: source.corporation } : {}),
    ...(source.sharedBy ? { sharedBy: source.sharedBy } : {}),
    ...(source.characterName ? { characterName: source.characterName } : {}),
    ...(source.extra ? { extra: source.extra } : {}),
    ...(source.pastLabelKey ? { pastLabelKey: source.pastLabelKey } : {}),
    ...(source.muted ? { muted: true } : {}),
    ...(source.detailId ? { detailId: source.detailId } : {}),
  };
}

export function buildCharacterBoard(sources: CharacterBoardSources): CharacterBoardItem[] {
  const items: CharacterBoardItem[] = [];
  for (const kind of CHARACTER_BOARD_ITEM_KINDS) {
    for (const source of sources[SOURCE_KEY[kind]] ?? []) {
      items.push(toItem(source, kind, sources.nowMs));
    }
  }

  return items.sort((a, b) => {
    const byDeadline = a.deadlineMs - b.deadlineMs;
    if (byDeadline !== 0) return byDeadline;
    const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
    if (byKind !== 0) return byKind;
    return a.id.localeCompare(b.id);
  });
}

import { describe, expect, it } from 'vitest';
import { buildCorpBoard, mergeCorpBoards, type CorpBoardSources } from '../corp/board';
import { buildCharacterBoard } from './board';
import { toCorpCalendarSources } from './corpCalendar';
import { countsByDay, filterByCorporation } from './deadlines';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 23:30 EVE time: a day later than the local day anywhere west of Greenwich.
const NOW = Date.UTC(2026, 10, 12, 23, 30);

const LABELS = new Map([
  [1, { name: 'Main Corp', ticker: 'MAIN' }],
  [2, { name: 'Holding Two', ticker: 'HOLD2' }],
]);

function corpBoard(sources: Omit<CorpBoardSources, 'nowMs' | 'staleWindowMs'>) {
  return buildCorpBoard({
    nowMs: NOW,
    staleWindowMs: HOUR,
    includeRunningJobs: true,
    ...sources,
  });
}

const structure = (structureId: number, name: string, fuelExpiresMs: number | null) => ({
  structureId,
  name,
  fuelExpiresMs,
  state: null,
  stateTimerEndMs: null,
  unanchorsAtMs: null,
  services: [],
});

function twoCorporations() {
  return mergeCorpBoards([
    {
      corporationId: 1,
      items: corpBoard({
        structures: [
          {
            ...structure(100, 'Jita - Main Fort', NOW + 2 * DAY),
            state: 'armor_reinforce',
            stateTimerEndMs: NOW + 3 * DAY,
          },
        ],
        jobs: [
          { jobId: 7, subject: 'Rifter', endMs: NOW + 4 * DAY, status: 'active', typeId: 587 },
          { jobId: 8, subject: 'Slasher', endMs: NOW - HOUR, status: 'active', typeId: 585 },
        ],
      }),
    },
    {
      corporationId: 2,
      items: corpBoard({
        // The same structure id in a second corporation's read must not collide.
        structures: [structure(100, 'Perimeter - Holding Raitaru', NOW + 5 * DAY)],
        extractions: [
          {
            structureId: 200,
            subject: 'Holding Athanor',
            chunkArrivalMs: NOW + 6 * DAY,
            naturalDecayMs: NOW + 9 * DAY,
          },
        ],
      }),
    },
  ]);
}

describe('toCorpCalendarSources', () => {
  it('turns deadline rows from two corporations into events naming corporation and structure', () => {
    const sources = toCorpCalendarSources(twoCorporations(), LABELS);

    expect(sources.structureFuel).toEqual([
      {
        id: '1:fuel:100',
        subject: 'Jita - Main Fort',
        detail: '',
        deadlineMs: NOW + 2 * DAY,
        corporation: { id: 1, name: 'Main Corp', ticker: 'MAIN' },
      },
      {
        id: '2:fuel:100',
        subject: 'Perimeter - Holding Raitaru',
        detail: '',
        deadlineMs: NOW + 5 * DAY,
        corporation: { id: 2, name: 'Holding Two', ticker: 'HOLD2' },
      },
    ]);
    expect(sources.structureTimers).toEqual([
      {
        id: '1:state:100',
        subject: 'Jita - Main Fort',
        detail: 'armor_reinforce',
        deadlineMs: NOW + 3 * DAY,
        corporation: { id: 1, name: 'Main Corp', ticker: 'MAIN' },
      },
    ]);
    expect(sources.moonChunks).toEqual([
      {
        id: '2:moon:200',
        subject: 'Holding Athanor',
        detail: 'arrival',
        deadlineMs: NOW + 6 * DAY,
        corporation: { id: 2, name: 'Holding Two', ticker: 'HOLD2' },
      },
    ]);
  });

  it('dates a running corp job at its finish and marks a finished one ready', () => {
    const { corpJobs } = toCorpCalendarSources(twoCorporations(), LABELS);
    expect(
      corpJobs.map(({ subject, detail, deadlineMs }) => ({ subject, detail, deadlineMs }))
    ).toEqual([
      { subject: 'Slasher', detail: 'ready', deadlineMs: NOW - HOUR },
      { subject: 'Rifter', detail: 'active', deadlineMs: NOW + 4 * DAY },
    ]);
  });

  it('leaves out a clock with no instant: a structure already dry, an offline service', () => {
    const board = mergeCorpBoards([
      {
        corporationId: 1,
        items: corpBoard({
          structures: [
            {
              ...structure(100, 'Dry Fort', null),
              services: [{ name: 'Clone Bay', state: 'offline' }],
            },
          ],
        }),
      },
    ]);
    const sources = toCorpCalendarSources(board, LABELS);
    expect(Object.values(sources).flat()).toEqual([]);
  });

  it('leaves out sovereignty rows, which the Calendar does not show yet', () => {
    const board = mergeCorpBoards([
      {
        corporationId: 1,
        items: corpBoard({
          sovereignty: [
            { id: 'hub:9', name: 'Hub', kind: 'hub', startMs: NOW + DAY, endMs: NOW + 2 * DAY },
          ],
          hubFuel: [{ id: 'hub:9', name: 'Hub', runsOutMs: NOW + DAY }],
        }),
      },
    ]);
    expect(Object.values(toCorpCalendarSources(board, LABELS)).flat()).toEqual([]);
  });

  it('falls back to the corporation id when the corporation has no label', () => {
    const board = mergeCorpBoards([
      { corporationId: 3, items: corpBoard({ structures: [structure(1, 'Fort', NOW + DAY)] }) },
    ]);
    expect(toCorpCalendarSources(board, LABELS).structureFuel[0]?.corporation).toEqual({
      id: 3,
      name: '3',
      ticker: '3',
    });
  });
});

describe('corp events on the Calendar board', () => {
  const sources = toCorpCalendarSources(twoCorporations(), LABELS);
  const board = buildCharacterBoard({ nowMs: NOW, ...sources });

  it('carries the corporation onto every corp item, in deadline order', () => {
    expect(board.map((item) => [item.kind, item.subject, item.corporation?.ticker])).toEqual([
      ['corpJob', 'Slasher', 'MAIN'],
      ['structureFuel', 'Jita - Main Fort', 'MAIN'],
      ['structureTimer', 'Jita - Main Fort', 'MAIN'],
      ['corpJob', 'Rifter', 'MAIN'],
      ['structureFuel', 'Perimeter - Holding Raitaru', 'HOLD2'],
      ['moonChunk', 'Holding Athanor', 'HOLD2'],
    ]);
  });

  it.each([
    ['structureFuel', NOW + 2 * DAY],
    ['structureTimer', NOW + 3 * DAY],
    ['corpJob', NOW + 4 * DAY],
    ['moonChunk', NOW + 6 * DAY],
  ] as const)('puts %s on its day in EVE time and in local time', (kind, deadlineMs) => {
    const at = new Date(deadlineMs);
    const eveDay = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    const localDay = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

    expect(countsByDay(board, 'UTC').get(eveDay)?.kinds).toContain(kind);
    expect(countsByDay(board, undefined).get(localDay)?.kinds).toContain(kind);
  });
});

describe('filterByCorporation', () => {
  const personal = { id: '1', subject: 'Skill', detail: '', deadlineMs: NOW + DAY };
  const board = buildCharacterBoard({
    nowMs: NOW,
    skillTraining: [personal],
    ...toCorpCalendarSources(twoCorporations(), LABELS),
  });

  it('keeps everything on All', () => {
    expect(filterByCorporation(board, 'all')).toEqual(board);
  });

  it('hides every corp event and keeps personal ones', () => {
    expect(filterByCorporation(board, 'none').map((item) => item.kind)).toEqual(['skillTraining']);
  });

  it('keeps one corporation and the personal events', () => {
    expect(filterByCorporation(board, 2).map((item) => item.subject)).toEqual([
      'Skill',
      'Perimeter - Holding Raitaru',
      'Holding Athanor',
    ]);
  });
});

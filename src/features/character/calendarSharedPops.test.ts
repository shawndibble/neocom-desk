import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { buildCharacterBoard } from '@/engine/character/board';
import { filterByCorporation, filterBySharingCorporation } from '@/engine/character/deadlines';
import { parseStartLink, popOfStartLink } from '@/features/survey/startLink';
import type { SharedPopView } from '@/sync/sharedPops';
import type { BoardCalendarEventSource, BoardClockSource } from '@/engine/character/board';
import {
  boardSourcesWithSharedPops,
  dropEventsOfSharedPops,
  sharedPopIsShown,
  sharedPopMiningState,
  toSharedPopSources,
  type SharedPopEntry,
} from './calendarSharedPops';
import { sharedPopDetail, sharedPopStartLink } from './sharedPopDetail';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

function pop(overrides: Partial<SharedPopView> = {}): SharedPopView {
  return {
    id: '98000001_x1',
    extractionId: 'x1',
    moonId: 40_000_001,
    structureId: 1_000_000_000_001,
    refineryName: 'Efa - Tatara',
    solarSystemId: 30_000_001,
    popTime: 'ready',
    popAt: iso(NOW + 10 * HOUR_MS),
    fractured: false,
    startedAt: iso(NOW - 5 * 24 * HOUR_MS),
    expiresAt: iso(NOW + 61 * HOUR_MS),
    ore: [{ typeId: 45_490, quantity: 1_200_000 }],
    notes: 'Fleet forms in local.',
    ratePct: 10,
    corporationId: 98_000_001,
    syncedAt: NOW - HOUR_MS,
    ...overrides,
  };
}

const CORP = { id: 98_000_001, name: 'Tax Corp', ticker: 'TAX' };

function entry(overrides: Partial<SharedPopView> = {}): SharedPopEntry {
  return {
    pop: pop(overrides),
    moonName: 'Efa I - Moon 1',
    corporation: CORP,
    ore: [{ name: 'Zeolites', quantity: 1_200_000 }],
  };
}

describe('Shared Pops as Calendar clocks', () => {
  it('counts down to the Pop Time, named by refinery alone: the moon lives in the detail', () => {
    const [row] = toSharedPopSources([entry()], new Set(), NOW);
    expect(row).toEqual({
      id: '98000001_x1',
      subject: 'Efa - Tatara',
      detail: 'ready',
      deadlineMs: NOW + 10 * HOUR_MS,
      sharedBy: CORP,
      pastLabelKey: 'calendar.popped',
    });
    expect(
      toSharedPopSources([entry({ popTime: 'auto-fracture' })], new Set(), NOW)[0]!.detail
    ).toBe('autoFracture');
  });

  it('is two rows: the pop stays on its Pop Time, a muted one counts to the belt expiry', () => {
    const rows = toSharedPopSources([entry({ popAt: iso(NOW - HOUR_MS) })], new Set(), NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: '98000001_x1',
      detail: 'ready',
      deadlineMs: NOW - HOUR_MS,
      pastLabelKey: 'calendar.popped',
    });
    expect(rows[0]).not.toHaveProperty('muted');
    expect(rows[1]).toMatchObject({
      id: '98000001_x1:expires',
      detailId: '98000001_x1',
      detail: 'expires',
      deadlineMs: NOW + 61 * HOUR_MS,
      muted: true,
    });
  });

  it('holds the expiry row back until the moon is ready', () => {
    expect(toSharedPopSources([entry()], new Set(), NOW).map((r) => r.id)).toEqual(['98000001_x1']);
    const ready = toSharedPopSources([entry()], new Set(), NOW + 10 * HOUR_MS);
    expect(ready.map((r) => r.id)).toEqual(['98000001_x1', '98000001_x1:expires']);
  });

  it('shows only from the Extraction start until its retention ends', () => {
    const notStarted = entry({ startedAt: iso(NOW + HOUR_MS) });
    const gone = entry({
      popAt: iso(NOW - 50 * HOUR_MS),
      expiresAt: iso(NOW - 4 * DAY_MS),
      retainUntil: iso(NOW - 1),
    });
    const oldDoc = entry({ popAt: iso(NOW - 50 * HOUR_MS), expiresAt: iso(NOW - 1) });
    expect(toSharedPopSources([notStarted, gone, oldDoc], new Set(), NOW)).toEqual([]);
    expect(
      sharedPopIsShown(pop({ retainUntil: iso(NOW + 1), expiresAt: iso(NOW - DAY_MS) }), NOW)
    ).toBe(true);
  });

  it('keeps an expired pop as an overdue row, "belt expired", until its retention ends', () => {
    const expired = entry({
      popAt: iso(NOW - 60 * HOUR_MS),
      expiresAt: iso(NOW - 6 * HOUR_MS),
      retainUntil: iso(NOW + 66 * HOUR_MS),
    });
    const row = toSharedPopSources([expired], new Set(), NOW)[1];
    expect(row).toMatchObject({ detail: 'expired', deadlineMs: NOW - 6 * HOUR_MS });
    expect(row).not.toHaveProperty('pastLabelKey');
  });

  describe("the viewer's Pop Time", () => {
    const both = (over: Partial<SharedPopView> = {}) =>
      entry({
        readyAt: iso(NOW + 10 * HOUR_MS),
        autoFractureAt: iso(NOW + 13 * HOUR_MS),
        ...over,
      });

    it('shows the expiry row from the earlier Pop Time, even when the viewer shows the later', () => {
      const ids = (now: number) =>
        toSharedPopSources([both()], new Set(), now, 'autoFracture').map((r) => r.id);
      expect(ids(NOW + 9 * HOUR_MS)).toHaveLength(1);
      expect(ids(NOW + 10 * HOUR_MS)).toHaveLength(2);
    });

    it("shows the officer's choice by default, and names the other time on the row", () => {
      const [row] = toSharedPopSources([both()], new Set(), NOW, 'asShared');
      expect(row).toMatchObject({
        detail: 'ready',
        deadlineMs: NOW + 10 * HOUR_MS,
        extra: { detail: 'autoFracture', atMs: NOW + 13 * HOUR_MS },
      });
      const [auto] = toSharedPopSources(
        [both({ popTime: 'auto-fracture', popAt: iso(NOW + 13 * HOUR_MS) })],
        new Set(),
        NOW,
        'asShared'
      );
      expect(auto).toMatchObject({
        detail: 'autoFracture',
        deadlineMs: NOW + 13 * HOUR_MS,
        extra: { detail: 'ready', atMs: NOW + 10 * HOUR_MS },
      });
    });

    it('overrides it with Ready or Auto-fracture', () => {
      expect(toSharedPopSources([both()], new Set(), NOW, 'autoFracture')[0]).toMatchObject({
        detail: 'autoFracture',
        deadlineMs: NOW + 13 * HOUR_MS,
        extra: { detail: 'ready', atMs: NOW + 10 * HOUR_MS },
      });
      const auto = both({ popTime: 'auto-fracture', popAt: iso(NOW + 13 * HOUR_MS) });
      expect(toSharedPopSources([auto], new Set(), NOW, 'ready')[0]).toMatchObject({
        detail: 'ready',
        deadlineMs: NOW + 10 * HOUR_MS,
      });
    });

    it('counts to the chosen time, so a pop is popped only once that time passes', () => {
      const between = NOW + 11 * HOUR_MS;
      const ready = toSharedPopSources([both()], new Set(), between, 'ready');
      const auto = toSharedPopSources([both()], new Set(), between, 'autoFracture');
      expect(ready[0]).toMatchObject({ detail: 'ready', deadlineMs: NOW + 10 * HOUR_MS });
      expect(ready[0]).not.toHaveProperty('extra');
      expect(auto[0]).toMatchObject({
        detail: 'autoFracture',
        deadlineMs: NOW + 13 * HOUR_MS,
        extra: { detail: 'ready', atMs: NOW + 10 * HOUR_MS },
      });
    });

    it('keeps the actual time once fractured early, with no second time to name', () => {
      const fired = iso(NOW - HOUR_MS);
      const early = both({ fractured: true, popAt: fired, readyAt: fired, autoFractureAt: fired });
      const [row] = toSharedPopSources([early], new Set(), NOW, 'autoFracture');
      expect(row).toMatchObject({ detail: 'ready', deadlineMs: NOW - HOUR_MS });
      expect(row).not.toHaveProperty('extra');
    });

    it('reads a pop published before both times existed as its single time', () => {
      const [row] = toSharedPopSources([entry()], new Set(), NOW, 'autoFracture');
      expect(row).toMatchObject({ deadlineMs: NOW + 10 * HOUR_MS });
      expect(row).not.toHaveProperty('extra');
    });
  });

  describe('finished or ongoing', () => {
    const popped = { popAt: iso(NOW - 3 * HOUR_MS) };

    it("is fully mined when an officer flagged it, and then reads that, not 'overdue'", () => {
      const flagged = entry({ ...popped, fullyMined: { byName: 'Mina', at: iso(NOW - HOUR_MS) } });
      expect(sharedPopMiningState(flagged)).toBe('fullyMined');
      const rows = toSharedPopSources([flagged], new Set(), NOW);
      expect(rows[0]).toMatchObject({
        detail: 'fullyMined',
        pastLabelKey: 'calendar.fullyMined',
      });
      expect(rows).toHaveLength(1);
    });

    it('is fully mined once its linked Survey is finished', () => {
      const done = { ...entry(popped), survey: { finished: true, percentLeft: 0, ores: [] } };
      expect(sharedPopMiningState(done)).toBe('fullyMined');
      const running = { ...entry(popped), survey: { finished: false, percentLeft: 62, ores: [] } };
      expect(sharedPopMiningState(running)).toBeNull();
    });

    it('is likely mined out only as a muted guess that never overrides the clock', () => {
      const likely = entry({ ...popped, likelyMinedOut: true });
      expect(sharedPopMiningState(likely)).toBe('likelyMinedOut');
      const row = toSharedPopSources([likely], new Set(), NOW)[1];
      expect(row).toMatchObject({
        detail: 'expires',
        deadlineMs: NOW + 61 * HOUR_MS,
        extra: { detail: 'likelyMinedOut' },
      });
      expect(row).not.toHaveProperty('pastLabelKey');
      const expired = entry({
        popAt: iso(NOW - 60 * HOUR_MS),
        expiresAt: iso(NOW - 6 * HOUR_MS),
        retainUntil: iso(NOW + 66 * HOUR_MS),
        likelyMinedOut: true,
      });
      expect(toSharedPopSources([expired], new Set(), NOW)[1]).toMatchObject({
        detail: 'expired',
        extra: { detail: 'likelyMinedOut' },
      });
    });

    it("does not guess before the pop pops on the pilot's own Pop Time", () => {
      const early = entry({
        likelyMinedOut: true,
        readyAt: iso(NOW - HOUR_MS),
        autoFractureAt: iso(NOW + 2 * HOUR_MS),
        popAt: iso(NOW - HOUR_MS),
      });
      const [row] = toSharedPopSources([early], new Set(), NOW, 'autoFracture');
      expect(row).toMatchObject({ detail: 'autoFracture' });
      expect(row!.extra).toEqual({ detail: 'ready', atMs: NOW - HOUR_MS });
      const facts = sharedPopDetail(early, NOW, t, 'UTC', 'autoFracture').facts.map((f) => f.value);
      expect(facts).not.toContain('calendar.sharedPop.likelyMinedOut');
    });

    it('says nothing about a pop that is not popped yet, or one nobody flagged', () => {
      expect(sharedPopMiningState(entry({ fullyMined: { byName: 'M', at: iso(NOW) } }))).toBe(
        'fullyMined'
      );
      expect(sharedPopMiningState(entry(popped))).toBeNull();
    });
  });

  it('is hidden when the pilot already reads that refinery as a corp moon chunk', () => {
    const readable = new Set([1_000_000_000_001]);
    expect(toSharedPopSources([entry()], readable, NOW)).toEqual([]);
  });

  it('falls back to the moon name, then the structure id, when the refinery is unnamed', () => {
    const unnamed = { ...entry({ refineryName: null }) };
    expect(toSharedPopSources([unnamed], new Set(), NOW)[0]).toMatchObject({
      subject: 'Efa I - Moon 1',
    });
    expect(toSharedPopSources([{ ...unnamed, moonName: null }], new Set(), NOW)[0]!.subject).toBe(
      '#1000000000001'
    );
  });

  it('rides the board as its own kind, filtered by sharing corporation and never by Corporation events', () => {
    const other = { ...entry({ id: '98000002_x2' }), corporation: { ...CORP, id: 98_000_002 } };
    const board = buildCharacterBoard({
      nowMs: NOW + 10 * HOUR_MS,
      sharedMoonPops: toSharedPopSources([entry(), other], new Set(), NOW + 10 * HOUR_MS),
    });
    expect(board.map((item) => item.kind)).toEqual(Array(4).fill('sharedMoonPop'));
    expect(board[0]!.sharedBy).toEqual(CORP);
    expect(filterByCorporation(board, 'none')).toHaveLength(4);
    expect(filterBySharingCorporation(board, 98_000_002).map((i) => i.sourceId)).toEqual([
      '98000002_x2',
      '98000002_x2:expires',
    ]);
    expect(filterBySharingCorporation(board, 'all')).toHaveLength(4);
  });
});

describe('Calendar events a Shared Pop already shows', () => {
  const event = (title: string, atMs: number, id = '1'): BoardCalendarEventSource => ({
    id,
    subject: title,
    detail: '',
    deadlineMs: atMs,
    response: 'not_responded',
    important: false,
  });
  const popAt = NOW + 10 * HOUR_MS;
  const named = entry({ refineryName: 'Ainsan - Foil Finish Foundry', popAt: iso(popAt) });
  const drop = (
    events: BoardCalendarEventSource[],
    entries = [named],
    readable = new Set<number>()
  ) => dropEventsOfSharedPops(events, entries, readable, NOW, 'asShared').map((e) => e.id);

  it('drops an event a minute before the pop whose title words are all in its name', () => {
    expect(drop([event('Ainsan Foil Finish', popAt - MINUTE_MS)])).toEqual([]);
    expect(drop([event('ainsan: FOIL finish!', popAt + 5 * MINUTE_MS)])).toEqual([]);
  });

  it('matches against the moon name too', () => {
    const e = entry({ refineryName: null, popAt: iso(popAt) });
    expect(drop([event('Efa I Moon 1', popAt)], [e])).toEqual([]);
  });

  it('keeps an event further than five minutes from the pop, or with a word the pop lacks', () => {
    expect(drop([event('Ainsan Foil Finish', popAt - 6 * MINUTE_MS)])).toEqual(['1']);
    expect(drop([event('Ainsan Qpef', popAt)])).toEqual(['1']);
    expect(drop([event('Ainsan Foil Finish Party', popAt)])).toEqual(['1']);
  });

  it('keeps an event with no usable title words', () => {
    expect(drop([event('  --  ', popAt)])).toEqual(['1']);
  });

  it("matches either Pop Time, so the viewer's choice never brings a duplicate back", () => {
    const both = entry({
      refineryName: 'Ainsan - Foil Finish Foundry',
      popAt: iso(popAt),
      readyAt: iso(popAt),
      autoFractureAt: iso(popAt + 3 * HOUR_MS),
    });
    expect(drop([event('Ainsan Foil Finish', popAt + 3 * HOUR_MS - MINUTE_MS)], [both])).toEqual(
      []
    );
  });

  it('keeps the event when its pop is not on the board (hidden by a corp read, or gone)', () => {
    const e = event('Ainsan Foil Finish', popAt);
    expect(drop([e], [named], new Set([named.pop.structureId]))).toEqual(['1']);
    const gone = entry({
      refineryName: 'Ainsan - Foil Finish Foundry',
      popAt: iso(popAt),
      retainUntil: iso(NOW - 1),
    });
    expect(drop([e], [gone])).toEqual(['1']);
  });
});

describe('the board sources with Shared Pops resolved', () => {
  const popAt = NOW + 10 * HOUR_MS;
  const named = entry({ refineryName: 'Ainsan - Foil Finish Foundry', popAt: iso(popAt) });
  const fleet: BoardCalendarEventSource = {
    id: '1',
    subject: 'Ainsan Foil Finish',
    detail: '',
    deadlineMs: popAt,
    response: 'accepted',
    important: false,
  };
  const other: BoardCalendarEventSource = { ...fleet, id: '2', subject: 'Alliance meeting' };
  const data = {
    calendarEvents: [fleet, other],
    sharedMoonPops: [] as BoardClockSource[],
    sharedPops: [named],
    readableRefineries: [],
    loadedAtMs: NOW,
  };

  it('drops the event that is the pop and rebuilds the pop rows at the chosen Pop Time', () => {
    const out = boardSourcesWithSharedPops(data, 'asShared');
    expect(out.calendarEvents?.map((e) => e.id)).toEqual(['2']);
    expect(out.sharedMoonPops?.map((p) => p.id)).toEqual(['98000001_x1']);
  });

  it('takes the events it is given (the RSVP overrides) in place of the read ones', () => {
    const out = boardSourcesWithSharedPops(data, 'asShared', [{ ...other, response: 'declined' }]);
    expect(out.calendarEvents).toEqual([{ ...other, response: 'declined' }]);
  });

  it('leaves a source that could not be read unread', () => {
    const out = boardSourcesWithSharedPops(
      { ...data, calendarEvents: undefined, sharedMoonPops: undefined },
      'asShared'
    );
    expect(out.calendarEvents).toBeUndefined();
    expect(out.sharedMoonPops).toBeUndefined();
  });
});

describe('Shared Pop start link and detail', () => {
  it('builds a Survey start link with the refinery, the sharing corporation as payee and the rate', () => {
    const path = sharedPopStartLink(entry());
    expect(path.startsWith('/survey?')).toBe(true);
    expect(parseStartLink(path.slice('/survey'.length))).toEqual({
      place: { id: 1_000_000_000_001, name: 'Efa - Tatara' },
      payee: { id: 98_000_001, name: '' },
      rate: 10,
      notes: '',
    });
  });

  it('shows the moon, Pop Time, rate, notes and ore make-up as shared, never ISK', () => {
    const detail = sharedPopDetail(entry(), NOW, t, 'UTC');
    expect(detail.title).toBe('Efa - Tatara');
    expect(detail.facts[0]).toEqual({ label: 'calendar.sharedPop.moon', value: 'Efa I - Moon 1' });
    expect(detail.facts.map((f) => f.label)).toContain('calendar.sharedPop.popTime.ready');
    expect(detail.status?.badge).toBeUndefined();
    expect(detail.status?.note).toBe('Fleet forms in local.');
    expect(detail.list?.items).toEqual([
      { key: 'Zeolites', text: 'Zeolites', value: 'calendar.sharedPop.units{"count":1200000}' },
    ]);
    expect(detail.place).toEqual({
      systemId: 30_000_001,
      name: 'Efa - Tatara',
      structureId: 1_000_000_000_001,
    });
    expect(detail.link?.to).toBe(sharedPopStartLink(entry()));
    expect(JSON.stringify(detail)).not.toMatch(/isk/i);
  });

  it('lists both Pop Times in the detail once the server publishes them', () => {
    const both = entry({
      readyAt: iso(NOW + 10 * HOUR_MS),
      autoFractureAt: iso(NOW + 13 * HOUR_MS),
    });
    const labels = sharedPopDetail(both, NOW, t, 'UTC').facts.map((f) => f.label);
    expect(labels).toContain('calendar.sharedPop.popTime.ready');
    expect(labels).toContain('calendar.sharedPop.popTime.autoFracture');
    const single = sharedPopDetail(entry(), NOW, t, 'UTC').facts.map((f) => f.label);
    expect(single).not.toContain('calendar.sharedPop.popTime.autoFracture');
  });

  it('says whether the moon is mined out, and never claims it is not when it only is not marked', () => {
    const popped = { popAt: iso(NOW - 3 * HOUR_MS) };
    const mining = (e: SharedPopEntry) =>
      sharedPopDetail(e, NOW, t, 'UTC').facts.filter((f) =>
        ['calendar.sharedPop.mining', 'calendar.sharedPop.survey'].includes(f.label)
      );
    expect(mining(entry(popped))).toEqual([
      { label: 'calendar.sharedPop.mining', value: 'calendar.sharedPop.notMarkedFullyMined' },
    ]);
    expect(mining(entry())).toEqual([]);
    expect(mining(entry({ ...popped, likelyMinedOut: true }))[0]!.value).toBe(
      'calendar.sharedPop.likelyMinedOut'
    );
    const flagged = mining(
      entry({ ...popped, fullyMined: { byName: 'Mina', at: iso(NOW - HOUR_MS) } })
    );
    expect(flagged[0]!.value).toContain('calendar.sharedPop.fullyMinedBy');
    expect(flagged[0]!.value).toContain('Mina');
    const running = mining({
      ...entry(popped),
      survey: { finished: false, percentLeft: 62, ores: [] },
    });
    expect(running).toContainEqual({
      label: 'calendar.sharedPop.survey',
      value: 'calendar.sharedPop.surveyLeft{"percent":62}',
    });
    const finished = mining({
      ...entry(popped),
      survey: { finished: true, percentLeft: 0, ores: [] },
    });
    expect(finished).toEqual([
      { label: 'calendar.sharedPop.survey', value: 'calendar.sharedPop.surveyFinished' },
    ]);
  });

  it('reads fractured once past the auto-fracture time, whatever the book last synced', () => {
    const late = entry({
      popTime: 'ready',
      readyAt: iso(NOW - 12 * HOUR_MS),
      autoFractureAt: iso(NOW - 8 * HOUR_MS),
      popAt: iso(NOW - 12 * HOUR_MS),
    });
    const detail = sharedPopDetail(late, NOW, t, 'UTC');
    expect(detail.status?.text).toBe('calendar.sharedPop.fractured');
    expect(detail.facts.map((f) => f.label)).not.toContain(
      'calendar.sharedPop.popTime.autoFracture'
    );
  });

  it('says fully mined and offers no new Survey for a moon an officer marked', () => {
    const marked = entry({
      popAt: iso(NOW - 3 * HOUR_MS),
      fullyMined: { byName: 'Mina', at: iso(NOW - HOUR_MS) },
    });
    expect(sharedPopDetail(marked, NOW, t, 'UTC').status?.text).toBe(
      'calendar.sharedPop.fullyMined'
    );
    expect(sharedPopDetail(marked, NOW, t, 'UTC').link).toBeUndefined();
    const linked = sharedPopDetail(
      { ...marked, pop: { ...marked.pop, surveyId: 'abc' } },
      NOW,
      t,
      'UTC'
    );
    expect(linked.link?.to).toBe('/s/abc');
    expect(linked.secondaryLink).toBeUndefined();
  });

  it("falls back to the linked Survey's ores when the book has no make-up", () => {
    const survey = {
      finished: false,
      percentLeft: 50,
      ores: [{ name: 'Bright Spodumain', percent: 60 }],
    };
    const detail = sharedPopDetail(
      { ...entry({ oreShared: true }), ore: null, survey },
      NOW,
      t,
      'UTC'
    );
    expect(detail.list?.items).toEqual([
      expect.objectContaining({
        text: 'Bright Spodumain',
        value: 'calendar.sharedPop.orePercent{"percent":60}',
      }),
    ]);
    expect(detail.facts.map((f) => f.value)).not.toContain('calendar.sharedPop.oreUnknown');
  });

  it('sends the refinery itself as the destination, not only its system', () => {
    expect(sharedPopDetail(entry({ solarSystemId: 30000142 }), NOW, t, 'UTC').place).toMatchObject({
      systemId: 30000142,
      structureId: entry().pop.structureId,
    });
  });

  it('names its pop in the start link, so the Survey it starts can be linked back', () => {
    const path = sharedPopStartLink(entry());
    expect(popOfStartLink(path.slice('/survey'.length))).toBe(entry().pop.id);
  });

  it('opens the linked Survey first and keeps starting a new one as the second action', () => {
    const detail = sharedPopDetail(entry({ surveyId: 'abc123' }), NOW, t, 'UTC');
    expect(detail.link).toEqual({ label: 'calendar.sharedPop.openSurvey', to: '/s/abc123' });
    expect(detail.secondaryLink?.to).toBe(sharedPopStartLink(entry()));
    expect(sharedPopDetail(entry(), NOW, t, 'UTC').secondaryLink).toBeUndefined();
  });

  it('leaves out the ore list and the notes when the book shares none', () => {
    const detail = sharedPopDetail({ ...entry({ notes: '' }), ore: null }, NOW, t, 'UTC');
    expect(detail.list).toBeUndefined();
    expect(detail.status?.note).toBeUndefined();
    expect(detail.facts.map((f) => f.label)).not.toContain('calendar.sharedPop.ore');
  });

  it('says the ore make-up is unknown when it is shared but the book holds none', () => {
    const detail = sharedPopDetail({ ...entry({ oreShared: true }), ore: null }, NOW, t, 'UTC');
    expect(detail.list).toBeUndefined();
    expect(detail.facts).toContainEqual({
      label: 'calendar.sharedPop.ore',
      value: 'calendar.sharedPop.oreUnknown',
    });
  });

  it('leaves the ore out when it is not shared, or the server predates the flag', () => {
    for (const oreShared of [false, undefined]) {
      const detail = sharedPopDetail({ ...entry({ oreShared }), ore: null }, NOW, t, 'UTC');
      expect(detail.facts.map((f) => f.label)).not.toContain('calendar.sharedPop.ore');
    }
  });

  it("shows the data's age, flagged once the book has not synced for 12 hours", () => {
    const fresh = sharedPopDetail(entry({ syncedAt: NOW - 3 * HOUR_MS }), NOW, t, 'UTC');
    expect(fresh.facts).toContainEqual({
      label: 'calendar.sharedPop.synced',
      value: 'common.age.hours{"count":3}',
    });
    const stale = sharedPopDetail(entry({ syncedAt: NOW - 13 * HOUR_MS }), NOW, t, 'UTC');
    expect(stale.facts).toContainEqual({
      label: 'calendar.sharedPop.synced',
      value: 'calendar.sharedPop.syncedStale{"age":"common.age.hours{\\"count\\":13}"}',
      tone: 'warning',
    });
    const unknown = sharedPopDetail(entry({ syncedAt: null }), NOW, t, 'UTC');
    expect(unknown.facts.map((f) => f.label)).not.toContain('calendar.sharedPop.synced');
  });
});

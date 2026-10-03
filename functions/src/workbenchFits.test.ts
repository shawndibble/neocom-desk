import { describe, expect, it } from 'vitest';
import {
  HULL_PART_BYTE_BUDGET,
  hullPartDocId,
  mergeHullFits,
  parseEftResponse,
  parsePublicFitsPage,
  parseRetryAfterMs,
  parseWorkbenchDate,
  planPage,
  runWorkbenchSync,
  splitHullParts,
  type FetchJsonResult,
  type StoredWorkbenchFit,
  type WorkbenchFitSummary,
  type WorkbenchFitsStore,
  type WorkbenchSyncState,
} from './workbenchFits.js';

function rawFit(
  id: string,
  shipId: number,
  dateAdded: string,
  extra: Record<string, unknown> = {}
) {
  return {
    Id: id,
    Name: `Fit ${id}`,
    Slug: 'vexor',
    ShipId: shipId,
    ShipGroupId: 0,
    ShipName: 'Vexor',
    CharacterId: 9000,
    CharacterName: 'Pilot',
    DateAdded: dateAdded,
    TotalDps: 0,
    ...extra,
  };
}

function summary(id: string, dateAdded: number, shipTypeId = 626): WorkbenchFitSummary {
  return { id, name: `Fit ${id}`, shipTypeId, authorId: 9000, authorName: 'Pilot', dateAdded };
}

function stored(id: string, dateAdded: number, eft = '[Vexor, x]'): StoredWorkbenchFit {
  return { id, name: `Fit ${id}`, authorId: 9000, authorName: 'Pilot', dateAdded, eft };
}

describe('parseWorkbenchDate', () => {
  it('reads an offset-less, 7-fraction-digit timestamp as UTC', () => {
    expect(parseWorkbenchDate('2026-10-03T14:53:29.3375697')).toBe(
      Date.UTC(2026, 9, 3, 14, 53, 29, 337)
    );
  });

  it('accepts no fraction and an explicit Z', () => {
    expect(parseWorkbenchDate('2026-10-03T14:53:29')).toBe(Date.UTC(2026, 9, 3, 14, 53, 29));
    expect(parseWorkbenchDate('2026-10-03T14:53:29.5Z')).toBe(
      Date.UTC(2026, 9, 3, 14, 53, 29, 500)
    );
  });

  it('rejects garbage', () => {
    expect(parseWorkbenchDate('yesterday')).toBeNull();
    expect(parseWorkbenchDate(42)).toBeNull();
  });
});

describe('parsePublicFitsPage', () => {
  it('maps rows to summaries, dropping rows without a hull, id or date', () => {
    const page = parsePublicFitsPage({
      NumberOfPages: 385,
      CurrentPage: 1,
      PageSize: 100,
      TotalFits: 38404,
      Fits: [
        rawFit('a', 626, '2026-10-03T14:53:29.3375697'),
        rawFit('b', 0, '2026-10-03T14:53:29'),
        rawFit('c', 626, 'nope'),
        { ...rawFit('d', 626, '2026-10-03T14:53:29'), Id: 7 },
      ],
      Error: false,
      Message: null,
    });
    expect(page.numberOfPages).toBe(385);
    expect(page.rowCount).toBe(4);
    expect(page.fits).toEqual([summary('a', Date.UTC(2026, 9, 3, 14, 53, 29, 337))]);
  });

  it('keeps an unnamed fit with a blank name and a missing author as unknown', () => {
    const page = parsePublicFitsPage({
      NumberOfPages: 1,
      Fits: [rawFit('a', 626, '2026-10-03T00:00:00', { Name: null, CharacterName: null })],
    });
    expect(page.fits[0]).toMatchObject({ name: '', authorName: '' });
  });

  it('throws on an error envelope or a missing Fits array', () => {
    expect(() => parsePublicFitsPage({ Error: true, Message: 'boom', Fits: [] })).toThrow(/boom/);
    expect(() => parsePublicFitsPage({ NumberOfPages: 1 })).toThrow();
    expect(() => parsePublicFitsPage(null)).toThrow();
  });
});

describe('parseEftResponse', () => {
  it('returns the EFT text, or null for an error or blank body', () => {
    expect(parseEftResponse({ Eft: '[Vexor, x]\n', Error: false })).toBe('[Vexor, x]\n');
    expect(parseEftResponse({ Eft: '', Error: false })).toBeNull();
    expect(parseEftResponse({ Eft: '[Vexor, x]', Error: true })).toBeNull();
    expect(parseEftResponse('nope')).toBeNull();
  });
});

describe('parseRetryAfterMs', () => {
  it('reads delay-seconds and an HTTP date, capped and never negative', () => {
    const now = Date.UTC(2026, 9, 3, 12, 0, 0);
    expect(parseRetryAfterMs('5', now, 60_000)).toBe(5_000);
    expect(parseRetryAfterMs('600', now, 60_000)).toBe(60_000);
    expect(parseRetryAfterMs(new Date(now + 3_000).toUTCString(), now, 60_000)).toBe(3_000);
    expect(parseRetryAfterMs(new Date(now - 3_000).toUTCString(), now, 60_000)).toBe(0);
    expect(parseRetryAfterMs(null, now, 60_000)).toBeNull();
    expect(parseRetryAfterMs('soon', now, 60_000)).toBeNull();
  });
});

describe('planPage', () => {
  const page1 = {
    numberOfPages: 3,
    rowCount: 3,
    fits: [summary('c', 30), summary('b', 20), summary('a', 10)],
  };

  it('starts a first pass at page 1, taking every fit and recording the head', () => {
    const plan = planPage({ boundary: null, pass: null }, page1, 1);
    expect(plan.fresh.map((f) => f.id)).toEqual(['c', 'b', 'a']);
    expect(plan.done).toBe(false);
    expect(plan.nextState).toEqual({
      boundary: null,
      pass: { nextPage: 2, head: { ids: ['c', 'b', 'a'], dateAdded: 30 } },
    });
  });

  it('stops at the first fit already stored and promotes the head to the boundary', () => {
    const state: WorkbenchSyncState = { boundary: { ids: ['b', 'a'], dateAdded: 20 }, pass: null };
    const plan = planPage(state, page1, 1);
    expect(plan.fresh.map((f) => f.id)).toEqual(['c']);
    expect(plan.done).toBe(true);
    expect(plan.nextState).toEqual({
      boundary: { ids: ['c', 'b', 'a'], dateAdded: 30 },
      pass: null,
    });
  });

  it('treats a fit older than the boundary as known even if its id was never seen', () => {
    const state: WorkbenchSyncState = { boundary: { ids: ['gone'], dateAdded: 25 }, pass: null };
    const plan = planPage(state, page1, 1);
    expect(plan.fresh.map((f) => f.id)).toEqual(['c']);
    expect(plan.done).toBe(true);
  });

  it('resumes a pass mid-walk without moving its head', () => {
    const head = { ids: ['z'], dateAdded: 99 };
    const state: WorkbenchSyncState = { boundary: null, pass: { nextPage: 2, head } };
    const plan = planPage(state, { numberOfPages: 3, rowCount: 1, fits: [summary('y', 5)] }, 2);
    expect(plan.fresh.map((f) => f.id)).toEqual(['y']);
    expect(plan.nextState).toEqual({ boundary: null, pass: { nextPage: 3, head } });
  });

  it('completes the pass on the last page or an empty one', () => {
    const head = { ids: ['z'], dateAdded: 99 };
    const state: WorkbenchSyncState = { boundary: null, pass: { nextPage: 3, head } };
    const last = planPage(state, { numberOfPages: 3, rowCount: 1, fits: [summary('y', 5)] }, 3);
    expect(last.done).toBe(true);
    expect(last.nextState).toEqual({ boundary: head, pass: null });
    const empty = planPage(state, { numberOfPages: 9, rowCount: 0, fits: [] }, 3);
    expect(empty.done).toBe(true);
  });

  it('keeps the old boundary when an empty list gives no head', () => {
    const boundary = { ids: ['a'], dateAdded: 10 };
    const plan = planPage({ boundary, pass: null }, { numberOfPages: 0, rowCount: 0, fits: [] }, 1);
    expect(plan.nextState).toEqual({ boundary, pass: null });
  });
});

describe('mergeHullFits', () => {
  it('dedupes by id (incoming wins) and sorts newest first', () => {
    const merged = mergeHullFits(
      [stored('a', 10, 'old'), stored('b', 20)],
      [stored('a', 10, 'new'), stored('c', 30)]
    );
    expect(merged.map((f) => f.id)).toEqual(['c', 'b', 'a']);
    expect(merged[2].eft).toBe('new');
  });

  it('is idempotent: re-merging the same page changes nothing', () => {
    const once = mergeHullFits([], [stored('a', 10), stored('b', 20)]);
    expect(mergeHullFits(once, [stored('a', 10), stored('b', 20)])).toEqual(once);
  });
});

describe('splitHullParts', () => {
  it('keeps a small hull in one part', () => {
    expect(splitHullParts([stored('a', 2), stored('b', 1)])).toEqual([
      [stored('a', 2), stored('b', 1)],
    ]);
  });

  it('splits across parts under the byte budget, in order', () => {
    const big = 'x'.repeat(300);
    const fits = [stored('a', 3, big), stored('b', 2, big), stored('c', 1, big)];
    const parts = splitHullParts(fits, 1_000);
    expect(parts.map((p) => p.map((f) => f.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('drops a single fit too big for any document', () => {
    const parts = splitHullParts([stored('a', 2, 'x'.repeat(2_000)), stored('b', 1)], 1_000);
    expect(parts.map((p) => p.map((f) => f.id))).toEqual([['b']]);
  });

  it('returns no parts for no fits, and defaults under Firestore 1 MiB', () => {
    expect(splitHullParts([])).toEqual([]);
    expect(HULL_PART_BYTE_BUDGET).toBeLessThan(1_048_576);
  });

  it('names parts by hull and index', () => {
    expect(hullPartDocId(626, 0)).toBe('626_0');
  });
});

class MemoryStore implements WorkbenchFitsStore {
  state: WorkbenchSyncState = { boundary: null, pass: null };
  hulls = new Map<number, StoredWorkbenchFit[][]>();
  async readState() {
    return this.state;
  }
  async saveState(state: WorkbenchSyncState) {
    this.state = state;
  }
  async readHull(shipTypeId: number) {
    const parts = this.hulls.get(shipTypeId) ?? [];
    return { fits: parts.flat(), partCount: parts.length };
  }
  async writeHull(shipTypeId: number, parts: StoredWorkbenchFit[][]) {
    this.hulls.set(shipTypeId, parts);
  }
}

/** A fake Workbench: a newest-first list, paged by `pageSize`, plus EFT per id. */
function fakeApi(
  fits: ReturnType<typeof rawFit>[],
  pageSize = 2,
  overrides: Record<string, FetchJsonResult[]> = {}
) {
  const calls: string[] = [];
  const fetchJson = async (url: string): Promise<FetchJsonResult> => {
    calls.push(url);
    const queued = overrides[url];
    if (queued?.length) return queued.shift()!;
    const pageMatch = /fits\/public\?page=(\d+)$/.exec(url);
    if (pageMatch) {
      const page = Number(pageMatch[1]);
      return {
        status: 200,
        retryAfter: null,
        body: {
          NumberOfPages: Math.ceil(fits.length / pageSize),
          Fits: fits.slice((page - 1) * pageSize, page * pageSize),
          Error: false,
        },
      };
    }
    const eftMatch = /fits\/([^/]+)\/eft$/.exec(url);
    if (eftMatch) {
      return {
        status: 200,
        retryAfter: null,
        body: { Eft: `[Hull, ${eftMatch[1]}]`, Error: false },
      };
    }
    return { status: 404, retryAfter: null, body: null };
  };
  return { fetchJson, calls };
}

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const LIST = [
  rawFit('f5', 626, '2026-10-03T00:00:05'),
  rawFit('f4', 627, '2026-10-03T00:00:04'),
  rawFit('f3', 626, '2026-10-03T00:00:03'),
  rawFit('f2', 626, '2026-10-03T00:00:02'),
  rawFit('f1', 627, '2026-10-03T00:00:01'),
];

describe('runWorkbenchSync', () => {
  it('walks every page on a first run, grouping fits by hull newest first', async () => {
    const store = new MemoryStore();
    const api = fakeApi(LIST);
    const c = clock();
    const result = await runWorkbenchSync({
      store,
      fetchJson: api.fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 10,
    });
    expect(result).toMatchObject({ pages: 3, fitsStored: 5, passComplete: true });
    expect(store.hulls.get(626)![0].map((f) => f.id)).toEqual(['f5', 'f3', 'f2']);
    expect(store.hulls.get(627)![0].map((f) => f.id)).toEqual(['f4', 'f1']);
    expect(store.hulls.get(626)![0][0]).toMatchObject({ eft: '[Hull, f5]', authorName: 'Pilot' });
    expect(store.state).toEqual({
      boundary: { ids: ['f5', 'f4'], dateAdded: Date.UTC(2026, 9, 3, 0, 0, 5) },
      pass: null,
    });
  });

  it('stops at the first already-stored fit on a later run', async () => {
    const store = new MemoryStore();
    const c = clock();
    await runWorkbenchSync({
      store,
      fetchJson: fakeApi(LIST).fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });

    const newer = [rawFit('f6', 626, '2026-10-03T00:00:06'), ...LIST];
    const api = fakeApi(newer);
    const result = await runWorkbenchSync({
      store,
      fetchJson: api.fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });
    expect(result).toMatchObject({ pages: 1, fitsStored: 1, passComplete: true });
    expect(api.calls.filter((u) => u.includes('page='))).toHaveLength(1);
    expect(api.calls.filter((u) => u.endsWith('/eft'))).toEqual([
      'https://api.eveworkbench.com/v1/fits/f6/eft',
    ]);
    expect(store.hulls.get(626)![0].map((f) => f.id)).toEqual(['f6', 'f5', 'f3', 'f2']);
  });

  it('checkpoints a pass that runs out of time and resumes it next run', async () => {
    const store = new MemoryStore();
    const c = clock();
    // Each request costs 10ms of budget; 50ms covers page 1 (1 list + 2 EFT) only.
    const first = await runWorkbenchSync({
      store,
      fetchJson: fakeApi(LIST).fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 50,
      requestGapMs: 10,
    });
    expect(first).toMatchObject({ pages: 1, passComplete: false });
    expect(store.state.pass?.nextPage).toBe(2);
    expect(store.state.boundary).toBeNull();
    expect(
      [...store.hulls.values()]
        .flat(2)
        .map((f) => f.id)
        .sort()
    ).toEqual(['f4', 'f5']);

    const second = await runWorkbenchSync({
      store,
      fetchJson: fakeApi(LIST).fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 10,
    });
    expect(second).toMatchObject({ pages: 2, passComplete: true });
    expect(store.hulls.get(626)![0].map((f) => f.id)).toEqual(['f5', 'f3', 'f2']);
    expect(store.state.boundary?.ids).toEqual(['f5', 'f4']);
  });

  it('does not advance past a page it could not finish', async () => {
    const store = new MemoryStore();
    const c = clock();
    // Budget runs out mid-way through page 2's EFTs: page 2 is discarded, not half-stored.
    const result = await runWorkbenchSync({
      store,
      fetchJson: fakeApi(LIST).fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 45,
      requestGapMs: 10,
    });
    expect(result.pages).toBe(1);
    expect(store.state.pass?.nextPage).toBe(2);
    expect(
      [...store.hulls.values()]
        .flat(2)
        .map((f) => f.id)
        .sort()
    ).toEqual(['f4', 'f5']);
  });

  it('waits out Retry-After on a 429 and retries', async () => {
    const store = new MemoryStore();
    const c = clock();
    const api = fakeApi(LIST.slice(0, 1), 2, {
      'https://api.eveworkbench.com/v1/fits/public?page=1': [
        { status: 429, retryAfter: '7', body: null },
      ],
    });
    const result = await runWorkbenchSync({
      store,
      fetchJson: api.fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });
    expect(result).toMatchObject({ fitsStored: 1, passComplete: true });
    expect(c.now()).toBeGreaterThanOrEqual(7_000);
  });

  it('skips a fit whose EFT is gone, and stops the run on a list failure', async () => {
    const store = new MemoryStore();
    const c = clock();
    const api = fakeApi(LIST, 2, {
      'https://api.eveworkbench.com/v1/fits/f4/eft': [
        { status: 404, retryAfter: null, body: null },
      ],
      'https://api.eveworkbench.com/v1/fits/public?page=2': [
        { status: 500, retryAfter: null, body: null },
        { status: 500, retryAfter: null, body: null },
        { status: 500, retryAfter: null, body: null },
      ],
    });
    const result = await runWorkbenchSync({
      store,
      fetchJson: api.fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });
    expect(result).toMatchObject({ pages: 1, fitsStored: 1, eftSkipped: 1, passComplete: false });
    expect(result.stoppedBy).toMatch(/500/);
    expect(store.state.pass?.nextPage).toBe(2);
  });

  it('keeps what it stored when the network drops mid-walk', async () => {
    const store = new MemoryStore();
    const c = clock();
    const api = fakeApi(LIST);
    const fetchJson = async (url: string) => {
      if (url.endsWith('page=2')) throw new TypeError('fetch failed');
      return api.fetchJson(url);
    };
    const result = await runWorkbenchSync({
      store,
      fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });
    expect(result).toMatchObject({ pages: 1, fitsStored: 2, passComplete: false });
    expect(result.stoppedBy).toMatch(/HTTP 0/);
    expect(store.state.pass?.nextPage).toBe(2);
  });

  it('stops, checkpointed, on an error envelope', async () => {
    const store = new MemoryStore();
    const c = clock();
    const api = fakeApi(LIST, 2, {
      'https://api.eveworkbench.com/v1/fits/public?page=1': [
        { status: 200, retryAfter: null, body: { Error: true, Message: 'down' } },
      ],
    });
    const result = await runWorkbenchSync({
      store,
      fetchJson: api.fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
    });
    expect(result).toMatchObject({
      pages: 0,
      fitsStored: 0,
      stoppedBy: expect.stringMatching(/down/),
    });
    expect(store.state).toEqual({ boundary: null, pass: null });
  });

  it('splits a hull that outgrows one document', async () => {
    const store = new MemoryStore();
    const c = clock();
    await runWorkbenchSync({
      store,
      fetchJson: fakeApi(LIST).fetchJson,
      now: c.now,
      sleep: c.sleep,
      budgetMs: 60_000,
      requestGapMs: 0,
      partByteBudget: 250,
    });
    expect(store.hulls.get(626)!.length).toBeGreaterThan(1);
    expect(
      store.hulls
        .get(626)!
        .flat()
        .map((f) => f.id)
    ).toEqual(['f5', 'f3', 'f2']);
  });
});

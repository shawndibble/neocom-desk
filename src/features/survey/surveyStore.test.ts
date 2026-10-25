import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSurveyScan,
  finishSurvey,
  forgetSurveyCache,
  loadSurvey,
  loadSurveyCached,
  SURVEY_DETAILS_TTL_MS,
  MAX_LOCATION_NAME,
  MAX_SCAN_BY,
  MAX_SCAN_TEXT,
  MAX_SURVEY_NOTES,
  setSurveyInfo,
  setSurveyOwner,
  setSurveyScanIgnored,
  setSurveyTax,
  startSurvey,
} from './surveyStore';

const { addDoc, updateDoc, getDocs, loadShare, saveShare, FakeTimestamp } = vi.hoisted(() => {
  class FakeTimestamp {
    constructor(readonly millis: number) {}
    static fromMillis(millis: number) {
      return new FakeTimestamp(millis);
    }
    toMillis() {
      return this.millis;
    }
  }
  return {
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    getDocs: vi.fn(),
    loadShare: vi.fn(),
    saveShare: vi.fn(),
    FakeTimestamp,
  };
});

vi.mock('firebase/firestore/lite', () => ({
  addDoc,
  updateDoc,
  // Real docs always carry an id, which the merge keys on; most fixtures here leave it off.
  getDocs: async (ref: unknown) => {
    const snapshot = (await getDocs(ref)) as { docs: { id?: string }[] };
    return { docs: snapshot.docs.map((d, i) => ({ id: `doc${i}`, ...d })) };
  },
  query: (ref: { path: string }, ...constraints: unknown[]) => ({ path: ref.path, constraints }),
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  orderBy: (field: string, dir = 'asc') => ({ orderBy: [field, dir] }),
  limit: (n: number) => ({ limit: n }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TIME',
  Timestamp: FakeTimestamp,
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/features/share/shareStore', () => ({
  loadShare,
  saveShare,
  shareUrl: (id: string) => `https://neocomdesk.test/s/${id}`,
}));

const ROW = (units: number, volume: number) => `Veldspar\t${units}\t${volume} m3\t1.00 ISK\t20 km`;
const EXPIRES = Date.UTC(2026, 9, 15);

beforeEach(() => {
  addDoc.mockReset();
  updateDoc.mockReset();
  getDocs.mockReset();
  loadShare.mockReset();
  saveShare.mockReset();
  forgetSurveyCache();
});

describe('startSurvey', () => {
  it('stores a survey Share Link and returns its id and URL', async () => {
    saveShare.mockResolvedValue(EXPIRES);
    const started = await startSurvey({ characterId: 7, ownerName: 'Shawn Dibble' });
    expect(saveShare).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'survey',
        payload: { v: 1, owner: 'Shawn Dibble' },
        characterId: 7,
      })
    );
    expect(started.id).toMatch(/^[2-9a-hj-kmnp-z]{6}$/);
    expect(started.url).toBe(`https://neocomdesk.test/s/${started.id}`);
    expect(started.expiresAt).toBe(EXPIRES);
  });
});

describe('addSurveyScan', () => {
  it('writes the pasted text with a server time and the survey expiry, with no sign-in', async () => {
    await addSurveyScan({ id: 'abc123XYZ', text: ROW(10, 5), expiresAt: EXPIRES });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyScans' },
      { text: ROW(10, 5), createdAt: 'SERVER_TIME', expiresAt: FakeTimestamp.fromMillis(EXPIRES) }
    );
  });

  it('stores who submitted the scan when a name is given, trimmed to the cap', async () => {
    await addSurveyScan({
      id: 'abc123XYZ',
      text: ROW(10, 5),
      expiresAt: EXPIRES,
      by: `  ${'N'.repeat(MAX_SCAN_BY + 20)}  `,
    });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyScans' },
      expect.objectContaining({ by: 'N'.repeat(MAX_SCAN_BY) })
    );
  });

  it('leaves the name off for an anonymous scan', async () => {
    await addSurveyScan({ id: 'abc123XYZ', text: ROW(10, 5), expiresAt: EXPIRES, by: '  ' });
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('by');
  });

  it('refuses text that is not a survey scan without writing', async () => {
    await expect(
      addSurveyScan({ id: 'abc123XYZ', text: 'Tritanium\t5', expiresAt: EXPIRES })
    ).rejects.toThrow('not-a-scan');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('refuses text over the size cap without writing', async () => {
    const big = Array.from({ length: Math.ceil(MAX_SCAN_TEXT / 30) }, () => ROW(10, 5)).join('\n');
    await expect(addSurveyScan({ id: 'abc123XYZ', text: big, expiresAt: EXPIRES })).rejects.toThrow(
      'too-large'
    );
    expect(addDoc).not.toHaveBeenCalled();
  });
});

describe('loadSurvey', () => {
  const docs = (...rows: { text: string; at: number }[]) => ({
    docs: rows.map((r) => ({
      data: () => ({ text: r.text, createdAt: FakeTimestamp.fromMillis(r.at) }),
    })),
  });

  it('returns the scans parsed and in time order, with the survey expiry', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    const scans = docs({ text: ROW(10, 4), at: 2000 }, { text: ROW(10, 5), at: 1000 });
    getDocs.mockImplementation(async (ref: { path: string }) =>
      ref.path.endsWith('surveyScans') ? scans : { docs: [] }
    );
    const result = await loadSurvey('abc123XYZ');
    expect(getDocs).toHaveBeenCalledWith({ path: 'shares/abc123XYZ/surveyScans' });
    expect(result).toEqual({
      ok: true,
      expiresAt: EXPIRES,
      owner: null,
      tax: null,
      info: null,
      ignored: new Set(),
      scans: [
        {
          id: 'doc1',
          at: 1000,
          rocks: [{ ore: 'Veldspar', units: 10, volume: 5, isk: 1, distanceM: 20_000 }],
        },
        {
          id: 'doc0',
          at: 2000,
          rocks: [{ ore: 'Veldspar', units: 10, volume: 4, isk: 1, distanceM: 20_000 }],
        },
      ],
    });
  });

  it('returns who submitted each scan, and none for an anonymous or older one', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockResolvedValue({
      docs: [
        {
          data: () => ({ text: ROW(10, 5), createdAt: FakeTimestamp.fromMillis(1000), by: 'Ann' }),
        },
        { data: () => ({ text: ROW(10, 4), createdAt: FakeTimestamp.fromMillis(2000), by: 7 }) },
      ],
    });
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans.map((s) => s.by)).toEqual(['Ann', undefined]);
  });

  it('returns the owner the survey was started under', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1, owner: 'Shawn Dibble' }, expiresAt: EXPIRES },
    });
    getDocs.mockResolvedValue(docs({ text: ROW(10, 5), at: 1000 }));
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.owner).toBe('Shawn Dibble');
  });

  it('has no owner for a survey stored before owners, or with a malformed one', async () => {
    getDocs.mockResolvedValue(docs({ text: ROW(10, 5), at: 1000 }));
    for (const payload of [{ v: 1 }, { v: 1, owner: 42 }, { v: 1, owner: '' }, null]) {
      loadShare.mockResolvedValue({
        ok: true,
        share: { type: 'survey', payload, expiresAt: EXPIRES },
      });
      const result = await loadSurvey('abc123XYZ');
      expect(result.ok && result.owner).toBeNull();
    }
  });

  it('skips a stored scan that no longer parses', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockResolvedValue(docs({ text: 'junk', at: 1000 }, { text: ROW(10, 5), at: 2000 }));
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans).toHaveLength(1);
  });

  it('is not-found for a Share Link of another type or one that is gone', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'dscan', payload: {}, expiresAt: EXPIRES },
    });
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
    loadShare.mockResolvedValue({ ok: false, reason: 'not-found' });
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('is failed when the scans cannot be read', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockRejectedValue(new Error('offline'));
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('moon tax', () => {
  it('stores each change as a new doc on the survey, expiring with it', async () => {
    await setSurveyTax({ id: 'abc123XYZ', expiresAt: EXPIRES, name: 'Moon Corp', pct: 8 });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyTax' },
      {
        name: 'Moon Corp',
        pct: 8,
        createdAt: 'SERVER_TIME',
        expiresAt: FakeTimestamp.fromMillis(EXPIRES),
      }
    );
  });

  it('loads the newest valid tax with the survey, and none when there is none', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    const tax = (name: unknown, pct: unknown, at: number) => ({
      data: () => ({ name, pct, createdAt: FakeTimestamp.fromMillis(at) }),
    });
    getDocs.mockImplementation(async (ref: { path: string }) =>
      ref.path.endsWith('surveyTax')
        ? {
            docs: [
              tax('Old Corp', 5, 1000),
              tax('Moon Corp', 12, 3000),
              tax('Bad', 150, 4000),
              tax('', 3, 5000),
            ],
          }
        : { docs: [] }
    );
    const result = await loadSurvey('abc123XYZ');
    expect(result).toMatchObject({ ok: true, tax: { name: 'Moon Corp', pct: 12 } });

    getDocs.mockResolvedValue({ docs: [] });
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ ok: true, tax: null });
  });
});

describe('location and notes', () => {
  it('stores the whole current info as a new doc, expiring with the survey', async () => {
    await setSurveyInfo({
      id: 'abc123XYZ',
      expiresAt: EXPIRES,
      location: { id: 60003760, name: 'Jita IV - Moon 4' },
      notes: 'Dock at the refinery.',
    });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyInfo' },
      {
        locationId: 60003760,
        locationName: 'Jita IV - Moon 4',
        notes: 'Dock at the refinery.',
        createdAt: 'SERVER_TIME',
        expiresAt: FakeTimestamp.fromMillis(EXPIRES),
      }
    );
  });

  it('stores a manual location by name alone, with no id', async () => {
    await setSurveyInfo({
      id: 'abc123XYZ',
      expiresAt: EXPIRES,
      location: { id: null, name: 'Moro - This is not a moodrill' },
      notes: '',
    });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyInfo' },
      {
        locationName: 'Moro - This is not a moodrill',
        createdAt: 'SERVER_TIME',
        expiresAt: FakeTimestamp.fromMillis(EXPIRES),
      }
    );
  });

  it('leaves out what is empty, so clearing a field stores its absence', async () => {
    await setSurveyInfo({ id: 'abc123XYZ', expiresAt: EXPIRES, location: null, notes: '  ' });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyInfo' },
      { createdAt: 'SERVER_TIME', expiresAt: FakeTimestamp.fromMillis(EXPIRES) }
    );
  });

  it('caps the notes and the location name at what the rules accept', async () => {
    await setSurveyInfo({
      id: 'abc123XYZ',
      expiresAt: EXPIRES,
      location: { id: 30000142, name: 'x'.repeat(MAX_LOCATION_NAME + 20) },
      notes: 'n'.repeat(MAX_SURVEY_NOTES + 20),
    });
    const data = addDoc.mock.calls[0][1] as { locationName: string; notes: string };
    expect(data.locationName).toHaveLength(MAX_LOCATION_NAME);
    expect(data.notes).toHaveLength(MAX_SURVEY_NOTES);
  });

  const info = (data: Record<string, unknown>, at: number) => ({
    data: () => ({ ...data, createdAt: FakeTimestamp.fromMillis(at) }),
  });
  const withInfo = (docs: unknown[]) => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockImplementation(async (ref: { path: string }) => ({
      docs: ref.path.endsWith('surveyInfo') ? docs : [],
    }));
  };

  it('loads a name-only location as a manual one with no id', async () => {
    withInfo([info({ locationName: 'Moro', notes: 'hi' }, 1)]);
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.info).toEqual({ location: { id: null, name: 'Moro' }, notes: 'hi' });
  });

  it('loads the newest valid info with the survey', async () => {
    withInfo([
      info({ locationId: 1, locationName: 'Old', notes: 'old' }, 1000),
      info({ locationId: 30000142, locationName: 'Jita', notes: 'Fleet on Mining.' }, 3000),
      info({ locationId: -5, locationName: 'Bad' }, 4000),
    ]);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({
      ok: true,
      info: { location: { id: 30000142, name: 'Jita' }, notes: 'Fleet on Mining.' },
    });
  });

  it('reads a doc with only notes as no location, and an emptied doc as nothing set', async () => {
    withInfo([info({ notes: 'Just notes' }, 1000)]);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({
      info: { location: null, notes: 'Just notes' },
    });
    withInfo([info({ notes: 'Just notes' }, 1000), info({}, 2000)]);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ info: { location: null, notes: '' } });
  });

  it('is null when nothing was stored, or the read fails', async () => {
    withInfo([]);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ ok: true, info: null });
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith('surveyInfo')) throw new Error('permission-denied');
      return { docs: [] };
    });
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ ok: true, info: null });
  });
});

describe('ignored scans', () => {
  it('stores each ignore or restore as a new doc on the survey, expiring with it', async () => {
    await setSurveyScanIgnored({
      id: 'abc123XYZ',
      expiresAt: EXPIRES,
      scanId: 'scan1',
      ignored: true,
    });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyIgnores' },
      {
        scanId: 'scan1',
        ignored: true,
        createdAt: 'SERVER_TIME',
        expiresAt: FakeTimestamp.fromMillis(EXPIRES),
      }
    );
  });

  const survey = (ignores: unknown[]) => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith('surveyScans')) {
        return {
          docs: [
            {
              id: 'scan1',
              data: () => ({ text: ROW(10, 5), createdAt: FakeTimestamp.fromMillis(1) }),
            },
          ],
        };
      }
      return { docs: ref.path.endsWith('surveyIgnores') ? ignores : [] };
    });
  };
  const ignore = (scanId: unknown, ignored: unknown, at: number) => ({
    data: () => ({ scanId, ignored, createdAt: FakeTimestamp.fromMillis(at) }),
  });

  it('gives each loaded scan its doc id', async () => {
    survey([]);
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans.map((s) => s.id)).toEqual(['scan1']);
  });

  it('loads the scans whose newest ignore doc says ignored, so a restore wins over an earlier ignore', async () => {
    survey([
      ignore('scan1', true, 1000),
      ignore('scan1', false, 2000),
      ignore('scan2', false, 1000),
      ignore('scan2', true, 3000),
      ignore('scan3', true, 1500),
    ]);
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && [...result.ignored].sort()).toEqual(['scan2', 'scan3']);
  });

  it('skips malformed ignore docs', async () => {
    survey([
      ignore(7, true, 1000),
      ignore('scan1', 'yes', 1000),
      { data: () => ({ scanId: 'scan1', ignored: true }) },
    ]);
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.ignored.size).toBe(0);
  });

  it('counts nothing as ignored when the ignores cannot be read, and still loads the scans', async () => {
    survey([]);
    const base = getDocs.getMockImplementation()!;
    getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path.endsWith('surveyIgnores')) throw new Error('offline');
      return base(ref);
    });
    const result = await loadSurvey('abc123XYZ');
    expect(result).toMatchObject({ ok: true, ignored: new Set() });
    expect(result.ok && result.scans).toHaveLength(1);
  });
});

describe('finishing a survey', () => {
  it('stores a cleared marker with no text, a server time, the survey expiry and who marked it', async () => {
    await finishSurvey({ id: 'abc123XYZ', expiresAt: EXPIRES, by: ' Shawn ' });
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ/surveyScans' },
      {
        text: '',
        cleared: true,
        by: 'Shawn',
        createdAt: 'SERVER_TIME',
        expiresAt: FakeTimestamp.fromMillis(EXPIRES),
      }
    );
  });

  it('leaves the name off for an anonymous visitor', async () => {
    await finishSurvey({ id: 'abc123XYZ', expiresAt: EXPIRES });
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('by');
  });

  it('loads a cleared marker as a scan with no rocks left', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ text: ROW(10, 5), createdAt: FakeTimestamp.fromMillis(1000) }) },
        {
          data: () => ({
            text: '',
            cleared: true,
            by: 'Shawn',
            createdAt: FakeTimestamp.fromMillis(2000),
          }),
        },
      ],
    });
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans[1]).toEqual({ id: 'doc1', at: 2000, rocks: [], by: 'Shawn' });
  });

  it('still skips an empty scan that is not marked cleared', async () => {
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1 }, expiresAt: EXPIRES },
    });
    getDocs.mockResolvedValue({
      docs: [{ data: () => ({ text: '', createdAt: FakeTimestamp.fromMillis(1000) }) }],
    });
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans).toEqual([]);
  });
});

describe('setSurveyOwner', () => {
  it('updates only the survey share payload owner', async () => {
    updateDoc.mockResolvedValue(undefined);
    await setSurveyOwner({ id: 'abc123XYZ', owner: '  New Pilot ' });
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'shares/abc123XYZ' },
      { 'payload.owner': 'New Pilot' }
    );
  });

  it('refuses an empty name', async () => {
    await expect(setSurveyOwner({ id: 'abc123XYZ', owner: '  ' })).rejects.toThrow();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('polling a survey', () => {
  const NOW = Date.UTC(2026, 9, 10, 12);
  const LIVE = NOW + 3 * 86_400_000;
  type Ref = { path: string; constraints?: unknown[] };
  type Stamp = InstanceType<typeof FakeTimestamp>;
  type Row = { id: string; data: () => Record<string, unknown> };
  const scanDoc = (id: string, at: number) => ({
    id,
    data: () => ({ text: ROW(10, 5), createdAt: FakeTimestamp.fromMillis(at) }),
  });
  const ignoreDoc = (id: string, scanId: string, ignored: boolean, at: number) => ({
    id,
    data: () => ({ scanId, ignored, createdAt: FakeTimestamp.fromMillis(at) }),
  });
  /** Serves each subcollection's docs, honouring the `>=` cursor and `limit` the store sends. */
  function serve(store: Record<string, Row[]>) {
    getDocs.mockImplementation(async (ref: Ref) => {
      const name = ref.path.split('/').pop()!;
      let rows = store[name] ?? [];
      for (const c of ref.constraints ?? []) {
        const w = (c as { where?: [string, string, Stamp] }).where;
        if (w) rows = rows.filter((r) => (r.data().createdAt as Stamp).millis >= w[2].millis);
        if ((c as { orderBy?: unknown }).orderBy) {
          rows = [...rows].sort(
            (a, b) => (b.data().createdAt as Stamp).millis - (a.data().createdAt as Stamp).millis
          );
        }
        const n = (c as { limit?: number }).limit;
        if (n !== undefined) rows = rows.slice(0, n);
      }
      return { docs: rows };
    });
  }
  const calls = () => getDocs.mock.calls.map(([ref]) => ref as Ref);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    loadShare.mockResolvedValue({
      ok: true,
      share: { type: 'survey', payload: { v: 1, owner: 'Ann' }, expiresAt: LIVE },
    });
  });
  afterEach(() => vi.useRealTimers());

  it('asks only for scans since the newest one seen, and merges what is new', async () => {
    const store = { surveyScans: [scanDoc('s1', 1000)] };
    serve(store);
    await loadSurvey('abc123XYZ');
    store.surveyScans.push(scanDoc('s2', 2000));
    getDocs.mockClear();
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans.map((s) => s.id)).toEqual(['s1', 's2']);
    const scansRef = calls().find((ref) => ref.path.endsWith('surveyScans'))!;
    expect(scansRef.constraints).toEqual([
      { where: ['createdAt', '>=', FakeTimestamp.fromMillis(1000)] },
    ]);
  });

  it('costs two queries when nothing is new, re-reading no share doc, tax or info', async () => {
    serve({ surveyScans: [scanDoc('s1', 1000)] });
    await loadSurvey('abc123XYZ');
    getDocs.mockClear();
    vi.setSystemTime(NOW + 30_000);
    const result = await loadSurvey('abc123XYZ');
    expect(result).toMatchObject({ ok: true, owner: 'Ann', expiresAt: LIVE });
    expect(loadShare).toHaveBeenCalledTimes(1);
    expect(
      calls()
        .map((ref) => ref.path.split('/').pop())
        .sort()
    ).toEqual(['surveyIgnores', 'surveyScans']);
  });

  it('takes an ignore or restore that arrives in a later poll', async () => {
    const store = {
      surveyScans: [scanDoc('s1', 1000), scanDoc('s2', 1500)],
      surveyIgnores: [ignoreDoc('i1', 's1', true, 2000)],
    };
    serve(store);
    const first = await loadSurvey('abc123XYZ');
    expect(first.ok && [...first.ignored]).toEqual(['s1']);
    store.surveyIgnores.push(ignoreDoc('i2', 's1', false, 3000), ignoreDoc('i3', 's2', true, 3000));
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && [...result.ignored]).toEqual(['s2']);
  });

  it('reads the newest tax and info alone', async () => {
    serve({
      surveyTax: [
        { id: 't1', data: () => ({ name: 'Old', pct: 5, createdAt: FakeTimestamp.fromMillis(1) }) },
        { id: 't2', data: () => ({ name: 'New', pct: 9, createdAt: FakeTimestamp.fromMillis(2) }) },
      ],
    });
    const result = await loadSurvey('abc123XYZ');
    expect(result).toMatchObject({ tax: { name: 'New', pct: 9 } });
    const taxRef = calls().find((ref) => ref.path.endsWith('surveyTax'))!;
    expect(taxRef.constraints).toEqual([{ orderBy: ['createdAt', 'desc'] }, { limit: 1 }]);
    const infoRef = calls().find((ref) => ref.path.endsWith('surveyInfo'))!;
    expect(infoRef.constraints).toEqual([{ orderBy: ['createdAt', 'desc'] }, { limit: 1 }]);
  });

  it('re-reads the share doc, tax and info once they are due', async () => {
    const store = { surveyTax: [] as Row[] };
    serve(store);
    await loadSurvey('abc123XYZ');
    store.surveyTax.push({
      id: 't1',
      data: () => ({ name: 'Moon Corp', pct: 8, createdAt: FakeTimestamp.fromMillis(5) }),
    });
    vi.setSystemTime(NOW + SURVEY_DETAILS_TTL_MS - 1);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ tax: null });
    vi.setSystemTime(NOW + SURVEY_DETAILS_TTL_MS);
    expect(await loadSurvey('abc123XYZ')).toMatchObject({ tax: { name: 'Moon Corp', pct: 8 } });
    expect(loadShare).toHaveBeenCalledTimes(2);
  });

  it('re-reads the details on the next load after this app changes them', async () => {
    serve({});
    await loadSurvey('abc123XYZ');
    await setSurveyTax({ id: 'abc123XYZ', expiresAt: LIVE, name: 'Moon Corp', pct: 8 });
    await loadSurvey('abc123XYZ');
    await setSurveyOwner({ id: 'abc123XYZ', owner: 'Bob' });
    await loadSurvey('abc123XYZ');
    expect(loadShare).toHaveBeenCalledTimes(3);
  });

  it('is not-found once the survey has expired, or its share is gone', async () => {
    serve({ surveyScans: [scanDoc('s1', 1000)] });
    await loadSurvey('abc123XYZ');
    vi.setSystemTime(LIVE);
    loadShare.mockResolvedValue({ ok: false, reason: 'not-found' });
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
    // The cache went with it: the next load asks the share doc again.
    vi.setSystemTime(NOW);
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
    expect(loadShare).toHaveBeenCalledTimes(3);
  });

  it('checks the share doc again after a failed poll', async () => {
    serve({ surveyScans: [scanDoc('s1', 1000)] });
    await loadSurvey('abc123XYZ');
    getDocs.mockRejectedValueOnce(new Error('permission-denied'));
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'failed' });
    loadShare.mockResolvedValue({ ok: false, reason: 'not-found' });
    expect(await loadSurvey('abc123XYZ')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('falls back to full reads while the createdAt index is not deployed', async () => {
    const store = { surveyScans: [scanDoc('s1', 1000)] };
    serve(store);
    const base = getDocs.getMockImplementation()!;
    getDocs.mockImplementation(async (ref: Ref) => {
      if (ref.constraints !== undefined)
        throw Object.assign(new Error('index'), { code: 'failed-precondition' });
      return base(ref);
    });
    await loadSurvey('abc123XYZ');
    store.surveyScans.push(scanDoc('s2', 2000));
    const result = await loadSurvey('abc123XYZ');
    expect(result.ok && result.scans.map((s) => s.id)).toEqual(['s1', 's2']);
    // Remembered: the next poll goes straight to the full read.
    getDocs.mockClear();
    await loadSurvey('abc123XYZ');
    expect(calls().every((ref) => ref.constraints === undefined)).toBe(true);
  });

  it('answers a cached load with no read at all, and loads one it has not seen', async () => {
    serve({ surveyScans: [scanDoc('s1', 1000)] });
    expect(await loadSurveyCached('abc123XYZ')).toMatchObject({ ok: true });
    getDocs.mockClear();
    loadShare.mockClear();
    const result = await loadSurveyCached('abc123XYZ');
    expect(result.ok && result.scans).toHaveLength(1);
    expect(getDocs).not.toHaveBeenCalled();
    expect(loadShare).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSurveyScan, loadSurvey, MAX_SCAN_TEXT, setSurveyTax, startSurvey } from './surveyStore';

const { addDoc, getDocs, loadShare, saveShare, FakeTimestamp } = vi.hoisted(() => {
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
    getDocs: vi.fn(),
    loadShare: vi.fn(),
    saveShare: vi.fn(),
    FakeTimestamp,
  };
});

vi.mock('firebase/firestore/lite', () => ({
  addDoc,
  getDocs,
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
  getDocs.mockReset();
  loadShare.mockReset();
  saveShare.mockReset();
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
    expect(started.id).toMatch(/^[2-9a-km-np-z]{6}$/);
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
    getDocs.mockResolvedValue(docs({ text: ROW(10, 4), at: 2000 }, { text: ROW(10, 5), at: 1000 }));
    const result = await loadSurvey('abc123XYZ');
    expect(getDocs).toHaveBeenCalledWith({ path: 'shares/abc123XYZ/surveyScans' });
    expect(result).toEqual({
      ok: true,
      expiresAt: EXPIRES,
      owner: null,
      tax: null,
      scans: [
        { at: 1000, rocks: [{ ore: 'Veldspar', units: 10, volume: 5, isk: 1, distanceM: 20_000 }] },
        { at: 2000, rocks: [{ ore: 'Veldspar', units: 10, volume: 4, isk: 1, distanceM: 20_000 }] },
      ],
    });
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadDefaultOptOuts, recordDefaultOptOuts, useDefaultOptOuts } from './defaultOptOuts';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn(), setSyncedSetting: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const NOW = Date.UTC(2026, 10, 3, 12);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  useDefaultOptOuts.setState({ value: [], hydrated: false });
});

describe('default opt-outs', () => {
  it('remembers the entries a pilot unassigned and reads them back', async () => {
    await recordDefaultOptOuts(
      [{ characterId: 1, date: '2026-11-02', solarSystemId: 30000142 }],
      NOW
    );
    expect(await loadDefaultOptOuts()).toEqual(new Set(['1|2026-11-02|30000142']));
  });

  it('keeps earlier ones and does not repeat an entry', async () => {
    const entry = { characterId: 1, date: '2026-11-02', solarSystemId: 30000142 };
    await recordDefaultOptOuts([entry], NOW);
    await recordDefaultOptOuts([entry, { ...entry, date: '2026-11-03' }], NOW);
    expect((await loadDefaultOptOuts()).size).toBe(2);
  });

  it('forgets entries older than the ledger keeps', async () => {
    await recordDefaultOptOuts([{ characterId: 1, date: '2026-01-01', solarSystemId: 1 }], NOW);
    await recordDefaultOptOuts([{ characterId: 1, date: '2026-11-02', solarSystemId: 1 }], NOW);
    expect(await loadDefaultOptOuts()).toEqual(new Set(['1|2026-11-02|1']));
  });

  it('has nothing before anything is recorded', async () => {
    expect(await loadDefaultOptOuts()).toEqual(new Set());
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { fetchCampaignState, loadJoinedObjectives } from './campaignData';

const mocks = vi.hoisted(() => ({
  campaigns: vi.fn(),
  objectives: vi.fn(),
  joined: vi.fn(),
}));

vi.mock('@/esi/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/endpoints')>()),
  getMilitaryCampaigns: mocks.campaigns,
  getMilitaryCampaignObjectives: mocks.objectives,
  getCharacterMilitaryCampaignObjectives: mocks.joined,
}));

const result = <T>(data: T) => ({ data, etag: null, pages: 1, expires: null, notModified: false });
const objective = (id: string, state = 'Active', progress = 10) => ({
  id,
  state,
  progress,
  participants: { total: 1, committed: 1, contributors: 1 },
  last_modified: '2026-11-23T00:00:00Z',
});

describe('fetchCampaignState', () => {
  beforeEach(() => {
    mocks.campaigns.mockReset();
    mocks.objectives.mockReset();
  });

  it('reads the objectives of the Active campaigns only, every cursor page of them', async () => {
    mocks.campaigns.mockResolvedValue(
      result({
        campaigns: [
          { id: 'old', state: 'Completed', progress: 30 },
          { id: 'now', state: 'Active', progress: 1 },
        ],
      })
    );
    mocks.objectives.mockImplementation(async (_id: string, { after }: { after?: string }) =>
      after === undefined
        ? result({ cursor: { after: 'p2' }, objectives: [objective('a')] })
        : after === 'p2'
          ? result({ cursor: { after: 'p3' }, objectives: [objective('b', 'Completed', 99)] })
          : result({ objectives: [] })
    );
    await expect(fetchCampaignState()).resolves.toEqual({
      campaigns: [
        { id: 'old', state: 'Completed', progress: 30 },
        { id: 'now', state: 'Active', progress: 1 },
      ],
      objectives: [
        { id: 'a', campaignId: 'now', state: 'Active', progress: 10 },
        { id: 'b', campaignId: 'now', state: 'Completed', progress: 99 },
      ],
    });
    expect(mocks.objectives.mock.calls.every(([id]) => id === 'now')).toBe(true);
  });

  it('throws when a page sends no body, so the last good state is kept', async () => {
    mocks.campaigns.mockResolvedValue(
      result({ campaigns: [{ id: 'now', state: 'Active', progress: 1 }] })
    );
    mocks.objectives.mockResolvedValue(result(null));
    await expect(fetchCampaignState()).rejects.toThrow(/no body/);
  });
});

describe('loadJoinedObjectives', () => {
  beforeEach(async () => {
    mocks.joined.mockReset();
    await db.tokens.clear();
    await db.esiCache.clear();
  });

  it('asks ESI nothing for a Character without the Military Campaigns Permission', async () => {
    await db.tokens.put({ characterId: 7, scopes: ['esi-skills.read_skills.v1'] } as never);
    await expect(loadJoinedObjectives(7)).resolves.toEqual({ kind: 'needsPermission' });
    expect(mocks.joined).not.toHaveBeenCalled();
  });

  it('reads the joined objectives, committed or resigned, with the contribution', async () => {
    await db.tokens.put({ characterId: 7, scopes: ['esi.activity.char:read'] } as never);
    mocks.joined.mockImplementation(async (_c: number, { after }: { after?: string }) =>
      after === undefined
        ? result({
            cursor: { after: 'x' },
            objectives: [
              {
                id: 'a',
                campaign_id: 'now',
                is_committed: true,
                contributed: 40,
                last_modified: '',
              },
              {
                id: 'b',
                campaign_id: 'now',
                is_committed: false,
                contributed: 2,
                last_modified: '',
              },
            ],
          })
        : result({ objectives: [] })
    );
    const read = await loadJoinedObjectives(7);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect([...read.joined.values()]).toEqual([
      { id: 'a', campaignId: 'now', committed: true, contributed: 40 },
      { id: 'b', campaignId: 'now', committed: false, contributed: 2 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { PilotStats } from '@/lib/zkillboard';
import type { CorpKillsFeed } from './corpFeeds';
import { corpKills } from './corpOpsModels';
import type { BuildContext, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const ctx: BuildContext = {
  t,
  now: 0,
  activeCharacterId: 1,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
};

const STATS: PilotStats = {
  kills: 1284,
  losses: 312,
  iskDestroyed: 900,
  iskLost: 100,
  iskEfficiency: 0.9,
  soloKills: 0,
  dangerRatio: null,
  gangRatio: null,
  topShips: [],
  memberCount: null,
};

function feeds(over: Partial<CorpKillsFeed> = {}, loading = false): Feeds {
  return {
    corpKills: {
      loading,
      error: false,
      data: {
        readable: true,
        needsReauth: false,
        fetchedAt: new Date(0),
        fromCache: false,
        corporationId: 98000001,
        stats: STATS,
        failed: null,
        ...over,
      },
    },
  };
}

describe('corpKills', () => {
  it('shows kills, losses and ISK efficiency, and opens the corporation in Public info', () => {
    const view = corpKills(feeds(), ctx);
    expect(view.to).toBe('/corp?info=corporation-98000001');
    expect(view.number.value).toBe('1,284');
    expect(view.number.secondary?.text).toContain('"losses":"312"');
    expect(view.number.secondary?.text).toContain('"efficiency":"90%"');
    expect(view.number.notes).toEqual(['overview.widgets.corpKills.allTime']);
    expect(view.status.isEmpty).toBe(false);
  });

  it('shows an unknown efficiency when no ISK moved', () => {
    const view = corpKills(feeds({ stats: { ...STATS, iskEfficiency: null } }), ctx);
    expect(view.number.secondary?.text).toContain('"efficiency":"—"');
  });

  it('degrades zKillboard being down to a note, not an error', () => {
    const view = corpKills(feeds({ stats: null, failed: 'offline' }), ctx);
    expect(view.status.error).toBe(false);
    expect(view.status.isEmpty).toBe(true);
    expect(view.emptyMessage).toBe('overview.widgets.corpKills.unavailable');
    expect(view.to).toBe('/corp?info=corporation-98000001');
  });

  it('says so when zKillboard has no history for the corporation', () => {
    const view = corpKills(feeds({ stats: null }), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.emptyMessage).toBe('overview.widgets.corpKills.empty');
  });

  it('notes an NPC corporation instead of asking zKillboard', () => {
    const view = corpKills(feeds({ readable: false, corporationId: 1000125, stats: null }), ctx);
    expect(view.emptyMessage).toBe('overview.widgets.corpKills.npc');
    expect(view.to).toBeNull();
  });

  it('is loading before the feed lands', () => {
    const view = corpKills({ corpKills: { loading: true, error: false, data: null } }, ctx);
    expect(view.status.loading).toBe(true);
  });
});

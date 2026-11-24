import { describe, expect, it } from 'vitest';
import type { CampaignCompletion } from '@/engine/campaigns/participation';
import type {
  CampaignWidgetCharacter,
  CampaignWidgetRow,
  MilitaryCampaignsWidgetData,
} from '@/features/campaigns/militaryCampaignsWidget';
import { FAILOVER } from '@/features/campaigns/turnInStoryData';
import type { CampaignFaction } from '../layout';
import { militaryCampaigns } from './militaryCampaignsModels';
import type { BuildContext, Feeds } from './types';

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}${JSON.stringify(values)}` : key) as BuildContext['t'];

const ctx = (over: Partial<BuildContext> & { campaignFaction?: CampaignFaction } = {}) =>
  ({
    t,
    now: 0,
    activeCharacterId: 1,
    scopeAll: false,
    notTrainingAlert: false,
    range: 30,
    ...over,
  }) as BuildContext;

const campaign = (
  campaignId: string,
  factionId: number,
  completed: number,
  state: CampaignCompletion['state'] = 'Active'
): CampaignCompletion => ({
  campaignId,
  title: `Campaign ${campaignId}`,
  factionId,
  state,
  completed,
  target: 4,
  fraction: completed / 4,
});

const CALDARI = campaign('camp-caldari', 500001, 1);
const MINMATAR = campaign('camp-minmatar', 500002, 2);

const turnInRow = (characterId: number, held: number): CampaignWidgetRow => ({
  key: `${characterId}:${FAILOVER.objectiveId}`,
  characterId,
  characterName: `Pilot ${characterId}`,
  objectiveId: FAILOVER.objectiveId,
  title: FAILOVER.objectiveTitle,
  factionId: 500001,
  filled: FAILOVER.filled,
  joined: null,
  turnIn: {
    typeId: FAILOVER.typeId,
    name: 'Shield Failover Report',
    held,
    reward: held * 60_000,
    offer: FAILOVER,
  },
});

const joinedRow = (characterId: number): CampaignWidgetRow => ({
  key: `${characterId}:mine`,
  characterId,
  characterName: `Pilot ${characterId}`,
  objectiveId: 'mine',
  title: 'Mine Pyroxeres',
  factionId: 500002,
  filled: 0.41,
  joined: { contributed: 48_200, isk: 1_446_000, lp: 1_000 },
  turnIn: null,
});

const pilot = (
  characterId: number,
  status: CampaignWidgetCharacter['status'] = 'ok'
): CampaignWidgetCharacter => ({ characterId, name: `Pilot ${characterId}`, status });

function feeds(over: Partial<MilitaryCampaignsWidgetData> = {}): Feeds {
  const data: MilitaryCampaignsWidgetData = {
    campaigns: [CALDARI, MINMATAR, campaign('old', 500003, 30, 'Completed')],
    characters: [pilot(1), pilot(2)],
    rows: [turnInRow(1, 640), joinedRow(1), turnInRow(2, 10)],
    fetchedAt: new Date(0),
    fromCache: false,
    ...over,
  };
  return { militaryCampaigns: { data, error: false, loading: false } };
}

describe('militaryCampaigns builder', () => {
  it('lists the header Character’s rows, single-line, a turn-in opening TurnInDetail', () => {
    const view = militaryCampaigns(feeds(), ctx());
    expect(view.status.isEmpty).toBe(false);
    const rows = view.table!.rows;
    expect(rows.map((row) => row.key)).toEqual([`1:${FAILOVER.objectiveId}`, '1:mine']);
    expect(rows[0]!.badge).toBe('overview.menu.factionChoice.caldari');
    expect(rows[0]!.cells[0]).toContain('turnInTitle');
    // One Character in view: "You hold".
    expect(rows[0]!.cells[1]).toContain('youHold');
    expect(rows[0]!.turnIn).toMatchObject({ name: 'Shield Failover Report', characterId: 1 });
    expect(rows[0]!.turnIn!.surfaceLine).toBe(rows[0]!.cells[1]);
    expect(rows[0]!.detail).toBeUndefined();
    // A joined objective that is no turn-in opens nothing.
    expect(rows[1]!.turnIn).toBeUndefined();
    expect(rows[1]!.cells[1]).toContain('earnedBoth');
  });

  it('on All, draws one ring per Active campaign in place of a single figure', () => {
    const view = militaryCampaigns(feeds(), ctx({ scopeAll: true }));
    expect(view.number.rings?.map((ring) => ring.key)).toEqual(['camp-caldari', 'camp-minmatar']);
    expect(view.number.rings![0]!.donut).toMatchObject({ kind: 'donut', of: 4 });
    expect(view.number.rings![0]!.donut.parts[0]!.value).toBe(1);
    // Every Character's held items are waiting: 650 × 60K.
    expect(view.number.secondary?.text).toContain('~39M');
    // Several Characters in view: each turn-in names its holder.
    const second = view.table!.rows.find((row) => row.key === `2:${FAILOVER.objectiveId}`);
    expect(second?.cells[1]).toContain('holds');
  });

  it('on one faction, the figure is its campaign’s completed objectives of the target with one ring', () => {
    const view = militaryCampaigns(feeds(), ctx({ campaignFaction: 'caldari' }));
    expect(view.number.value).toContain('"completed":1');
    expect(view.number.value).toContain('"target":4');
    expect(view.number.rings).toHaveLength(1);
    expect(view.number.rings![0]!.donut.centre).toBe('25%');
    expect(view.table!.rows.map((row) => row.key)).toEqual([`1:${FAILOVER.objectiveId}`]);
  });

  it('on All, keeps the per-faction line and ring even with one campaign running', () => {
    const view = militaryCampaigns(feeds({ campaigns: [CALDARI] }), ctx());
    expect(view.number.rings).toHaveLength(1);
    expect(view.number.value).toContain('factionLine');
  });

  it('draws a plain line, never a bare headline, when campaigns run but nothing is joined or held', () => {
    const all = militaryCampaigns(feeds({ rows: [] }), ctx());
    expect(all.status.isEmpty).toBe(false);
    expect(all.table!.rows).toEqual([]);
    expect(all.table!.emptyLine).toBe('overview.widgets.militaryCampaigns.noRows');
    const caldari = militaryCampaigns(feeds({ rows: [] }), ctx({ campaignFaction: 'caldari' }));
    expect(caldari.table!.emptyLine).toContain('noRowsFaction');
  });

  it('notes a Character whose own read failed instead of dropping its rows silently', () => {
    const view = militaryCampaigns(
      feeds({ characters: [pilot(1), pilot(2, 'failed')] }),
      ctx({ scopeAll: true })
    );
    expect(view.number.notes?.[0]).toContain('unread');
    expect(view.table!.footer).toContain('unread');
  });

  it('is empty with "No Military Campaign running" when nothing is Active', () => {
    const view = militaryCampaigns(feeds({ campaigns: [] }), ctx());
    expect(view.status.isEmpty).toBe(true);
    expect(view.emptyMessage).toBeUndefined();
    const caldari = militaryCampaigns(
      feeds({ campaigns: [MINMATAR] }),
      ctx({ campaignFaction: 'caldari' })
    );
    expect(caldari.status.isEmpty).toBe(true);
    expect(caldari.emptyMessage).toContain('emptyFaction');
  });

  it('needs permission when no Character in scope has Military Campaigns', () => {
    const view = militaryCampaigns(
      feeds({ characters: [pilot(1, 'needsPermission'), pilot(2, 'needsPermission')] }),
      ctx({ scopeAll: true })
    );
    expect(view.status.needsPermission).toBe(true);
    expect(view.grantCharacterId).toBe(1);
  });

  it('partly granted: the granted Characters’ rows and one header mark naming the rest', () => {
    const view = militaryCampaigns(
      feeds({
        characters: [pilot(1), pilot(2, 'needsPermission'), pilot(3, 'needsPermission')],
        rows: [turnInRow(1, 640)],
      }),
      ctx({ scopeAll: true })
    );
    expect(view.status.needsPermission).toBe(false);
    expect(view.table!.rows).toHaveLength(1);
    expect(view.headerMark).toMatchObject({
      characterId: 2,
      characterName: 'Pilot 2',
      count: 2,
      permission: 'militaryCampaigns',
    });
    expect(view.headerMark!.why).toContain('whyMarkSeveral');
  });

  it('fails when every granted Character’s read failed', () => {
    const view = militaryCampaigns(feeds({ characters: [pilot(1, 'failed')] }), ctx());
    expect(view.status.error).toBe(true);
    expect(view.status.hasData).toBe(false);
  });

  it('keeps a row whose campaign the SDE has not baked under All, and drops it under a faction', () => {
    const unknown = { ...joinedRow(1), key: '1:new', factionId: null };
    const all = militaryCampaigns(feeds({ rows: [unknown] }), ctx());
    expect(all.table!.rows.map((row) => row.badge)).toEqual([undefined]);
    const caldari = militaryCampaigns(
      feeds({ rows: [unknown] }),
      ctx({ campaignFaction: 'caldari' })
    );
    expect(caldari.table!.rows).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { ParticipatingObjective } from '@/engine/campaigns/participation';
import type { CampaignObjectiveEntry } from '@/sde/types';
import {
  campaignWidgetRows,
  turnInTypeIds,
  type CampaignCharacterReads,
} from './militaryCampaignsWidget';
import { FAILOVER, STEREO } from './turnInStoryData';

const objective = (
  id: string,
  over: Partial<CampaignObjectiveEntry> = {}
): CampaignObjectiveEntry => ({
  id,
  campaignId: 'camp-caldari',
  title: `Objective ${id}`,
  method: 'MineOre',
  targetProgress: 1_000,
  isk: { amount: 10, interval: 1 },
  ...over,
});

const joined = (o: CampaignObjectiveEntry, contributed: number): ParticipatingObjective => ({
  objective: o,
  contributed,
  progress: 400,
  targetProgress: 1_000,
  filled: 0.4,
});

const character = (over: Partial<CampaignCharacterReads> = {}): CampaignCharacterReads => ({
  characterId: 1,
  name: 'Kestrel Vane',
  participating: [],
  contributedTo: () => null,
  held: new Map(),
  ...over,
});

const offers = new Map([
  [FAILOVER.typeId, FAILOVER],
  [STEREO.typeId, STEREO],
]);
const names = new Map([[FAILOVER.typeId, 'Shield Failover Report']]);
const factionOf = (campaignId: string) => (campaignId === 'camp-caldari' ? 500001 : null);

describe('campaignWidgetRows', () => {
  it('lists a joined objective of any type with its contribution and earnings', () => {
    const rows = campaignWidgetRows(
      [character({ participating: [joined(objective('mine'), 250)] })],
      offers,
      names,
      factionOf
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: '1:mine',
      title: 'Objective mine',
      factionId: 500001,
      filled: 0.4,
      joined: { contributed: 250, isk: 2_500, lp: 0 },
      turnIn: null,
    });
  });

  it('adds a turn-in row for held items an Active objective takes, priced by turnInReward', () => {
    const rows = campaignWidgetRows(
      [character({ held: new Map([[FAILOVER.typeId, 640]]) })],
      offers,
      names,
      factionOf
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.joined).toBeNull();
    expect(rows[0]!.title).toBe(FAILOVER.objectiveTitle);
    // 640 × 28,000 ISK + 6 full blocks × 4,000 LP × 800.
    expect(rows[0]!.turnIn).toMatchObject({
      name: 'Shield Failover Report',
      held: 640,
      reward: 640 * 28_000 + 6 * 4_000 * 800,
    });
  });

  it('folds a joined turn-in objective and its held items into one row', () => {
    const turnInObjective = objective(FAILOVER.objectiveId, { method: 'ItemTraded' });
    const rows = campaignWidgetRows(
      [
        character({
          participating: [joined(turnInObjective, 100)],
          held: new Map([[FAILOVER.typeId, 10]]),
        }),
      ],
      offers,
      names,
      factionOf
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.joined?.contributed).toBe(100);
    expect(rows[0]!.turnIn?.held).toBe(10);
  });

  it('puts rows with items to hand in first, by what they pay, then the rest by title', () => {
    const rows = campaignWidgetRows(
      [
        character({
          participating: [joined(objective('b'), 1), joined(objective('a'), 1)],
          held: new Map([
            [STEREO.typeId, 10],
            [FAILOVER.typeId, 1_000],
          ]),
        }),
      ],
      offers,
      names,
      factionOf
    );
    expect(rows.map((row) => row.key)).toEqual([
      `1:${FAILOVER.objectiveId}`,
      `1:${STEREO.objectiveId}`,
      '1:a',
      '1:b',
    ]);
  });

  it('names an item it has no name for by its id, and ignores held items no offer takes', () => {
    const rows = campaignWidgetRows(
      [
        character({
          held: new Map([
            [STEREO.typeId, 5],
            [12345, 99],
          ]),
        }),
      ],
      offers,
      names,
      factionOf
    );
    expect(rows.map((row) => row.turnIn?.name)).toEqual([`#${STEREO.typeId}`]);
  });
});

describe('turnInTypeIds', () => {
  it('names the held types and the types of joined objectives an offer takes, even held by none', () => {
    const ids = turnInTypeIds(
      [
        character({ held: new Map([[STEREO.typeId, 5]]) }),
        character({
          characterId: 2,
          participating: [
            joined(objective(FAILOVER.objectiveId, { method: 'ItemTraded' }), 0),
            joined(objective('mine'), 1),
          ],
        }),
      ],
      offers
    );
    expect([...ids].sort()).toEqual([STEREO.typeId, FAILOVER.typeId].sort());
  });
});

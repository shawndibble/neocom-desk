import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { previewAvoid } from './avoidPreview';

const loadSolarSystemJumps = vi.fn();
const loadSolarSystems = vi.fn();

vi.mock('@/sde/loadMarketSde', () => ({
  loadSolarSystemJumps: () => loadSolarSystemJumps(),
  loadSolarSystems: () => loadSolarSystems(),
}));

// Start → Mid → End is the short way; Start → Aye → Bee → End goes round Mid.
const START = 30000001;
const MID = 30000002;
const END = 30000003;
const AYE = 30000004;
const BEE = 30000005;
const LONE = 30000006;

const JUMPS = {
  [START]: [MID, AYE],
  [MID]: [START, END, LONE],
  [END]: [MID, BEE],
  [AYE]: [START, BEE],
  [BEE]: [AYE, END],
  [LONE]: [MID],
};

const SYSTEMS = [
  { id: START, name: 'Start', security: 0.9, regionId: 10000001 },
  { id: MID, name: 'Mid', security: 0.9, regionId: 10000001 },
  { id: END, name: 'End', security: 0.9, regionId: 10000001 },
  { id: AYE, name: 'Aye', security: 0.46, regionId: 10000001 },
  { id: BEE, name: 'Bee', security: 0.7, regionId: 10000001 },
  { id: LONE, name: 'Lone', security: 0.9, regionId: 10000001 },
];

beforeEach(async () => {
  clearJumpGraphIndex();
  clearSolarSystemIndex();
  loadSolarSystemJumps.mockReset().mockResolvedValue(JUMPS);
  loadSolarSystems.mockReset().mockResolvedValue(SYSTEMS);
  await db.settings.clear();
  useAvoidedSystems.setState({ value: [], hydrated: true });
});

const RULES = { preference: 'shortest', securityPenalty: 50, avoid: [] } as const;
const LIST_ON = { avoidList: [], avoidListEnabled: true };

describe('previewAvoid', () => {
  it('routes with the candidate avoid list, giving the new jumps and lowest security', async () => {
    await expect(
      previewAvoid({
        fromId: START,
        toId: END,
        rules: RULES,
        systemId: MID,
        currentJumps: 2,
        ...LIST_ON,
      })
    ).resolves.toEqual({
      kind: 'preview',
      jumps: 3,
      jumpDelta: 1,
      // Rounded as the game shows it, the way the route summary does.
      lowestSecurity: 0.5,
      stillCrosses: false,
    });
  });

  it('keeps the rest of the rules, adding only the system to what is already avoided', async () => {
    await expect(
      previewAvoid({
        fromId: START,
        toId: END,
        rules: { ...RULES, avoid: [AYE] },
        systemId: MID,
        currentJumps: 2,
        ...LIST_ON,
      })
    ).resolves.toMatchObject({ kind: 'preview', jumps: 2, jumpDelta: 0, stillCrosses: true });
  });

  it('says plainly when there is no way around the system', async () => {
    await expect(
      previewAvoid({
        fromId: START,
        toId: LONE,
        rules: RULES,
        systemId: MID,
        currentJumps: 2,
        ...LIST_ON,
      })
    ).resolves.toMatchObject({ kind: 'preview', jumps: 2, jumpDelta: 0, stillCrosses: true });
  });

  it('adds the stored list too when the Avoided Systems switch is off', async () => {
    // Without Bee the route would detour through Aye and Bee (3 jumps); with it both ways cost an avoid.
    useAvoidedSystems.setState({ value: [BEE] });
    await expect(
      previewAvoid({
        fromId: START,
        toId: END,
        rules: RULES,
        systemId: MID,
        currentJumps: 2,
        avoidList: [BEE],
        avoidListEnabled: false,
      })
    ).resolves.toMatchObject({ kind: 'preview', stillCrosses: true, jumps: 2 });
  });

  it('saves nothing', async () => {
    useAvoidedSystems.setState({ value: [BEE] });
    await previewAvoid({
      fromId: START,
      toId: END,
      rules: RULES,
      systemId: MID,
      currentJumps: 2,
      ...LIST_ON,
    });

    expect(useAvoidedSystems.getState().value).toEqual([BEE]);
    expect(await db.settings.count()).toBe(0);
  });

  it('says it cannot tell when the stargate map is unreadable', async () => {
    loadSolarSystemJumps.mockRejectedValue(new Error('offline'));
    await expect(
      previewAvoid({
        fromId: START,
        toId: END,
        rules: RULES,
        systemId: MID,
        currentJumps: 2,
        ...LIST_ON,
      })
    ).resolves.toEqual({ kind: 'unknown' });
  });
});

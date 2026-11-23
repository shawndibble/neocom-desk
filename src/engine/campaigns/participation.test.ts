import { describe, expect, it } from 'vitest';
import type { CampaignObjectiveEntry, MilitaryCampaignEntry } from '@/sde/types';
import {
  campaignCompletions,
  participateState,
  participatingObjectives,
  type JoinedObjective,
} from './participation';

const joined = (rows: JoinedObjective[]) => new Map(rows.map((row) => [row.id, row]));
const row = (id: string, committed: boolean, contributed = 0): JoinedObjective => ({
  id,
  campaignId: 'camp-a',
  committed,
  contributed,
});

describe('participateState', () => {
  it('is unknown when the Character has not granted Military Campaigns (nothing read)', () => {
    expect(participateState('obj-1', null)).toBe('unknown');
  });

  it('is participating when the Character is committed to the objective', () => {
    expect(participateState('obj-1', joined([row('obj-1', true)]))).toBe('participating');
  });

  it('is not participating when it never joined, or resigned', () => {
    expect(participateState('obj-1', joined([]))).toBe('notParticipating');
    expect(participateState('obj-1', joined([row('obj-1', false, 300)]))).toBe('notParticipating');
  });
});

const objective = (
  id: string,
  over: Partial<CampaignObjectiveEntry> = {}
): CampaignObjectiveEntry => ({
  id,
  campaignId: 'camp-a',
  title: `Objective ${id}`,
  method: 'MineOre',
  targetProgress: 1_000,
  ...over,
});

describe('participatingObjectives', () => {
  const objectives = [
    objective('b'),
    objective('a', { campaignId: 'camp-b' }),
    objective('closed'),
    objective('resigned'),
    objective('unbaked-live-only'),
  ];
  const live = new Map([
    ['a', { state: 'Active' as const, progress: 250 }],
    ['b', { state: 'Active' as const, progress: 500 }],
    ['closed', { state: 'Completed' as const, progress: 1_000 }],
    ['resigned', { state: 'Active' as const, progress: 10 }],
  ]);
  const mine = joined([
    row('a', true, 40),
    row('b', true, 0),
    row('closed', true, 999),
    row('resigned', false, 5),
    row('not-in-sde', true, 1),
  ]);

  it('lists the Active objectives the Character Participates in, any type, with its contribution', () => {
    const rows = participatingObjectives(objectives, live, mine);
    expect(rows.map((r) => [r.objective.id, r.contributed, r.progress, r.filled])).toEqual([
      ['a', 40, 250, 0.25],
      ['b', 0, 500, 0.5],
    ]);
  });

  it('lists nothing without a read', () => {
    expect(participatingObjectives(objectives, live, null)).toEqual([]);
  });
});

describe('campaignCompletions', () => {
  const campaigns: MilitaryCampaignEntry[] = [
    { id: 'camp-a', title: 'Secure Strength', factionId: 500001, targetProgress: 4 },
    { id: 'camp-b', title: 'Equilibrium', factionId: 500004, targetProgress: 4 },
    { id: 'camp-old', title: 'Old', factionId: 500001, targetProgress: 30 },
  ];

  it('gives each listed campaign its completed objectives against its target, Active first', () => {
    expect(
      campaignCompletions(campaigns, [
        { id: 'camp-old', state: 'Completed', progress: 30 },
        { id: 'camp-b', state: 'Active', progress: 3 },
        { id: 'camp-a', state: 'Active', progress: 1 },
        { id: 'not-baked', state: 'Active', progress: 1 },
      ])
    ).toEqual([
      {
        campaignId: 'camp-b',
        title: 'Equilibrium',
        factionId: 500004,
        state: 'Active',
        completed: 3,
        target: 4,
        fraction: 0.75,
      },
      {
        campaignId: 'camp-a',
        title: 'Secure Strength',
        factionId: 500001,
        state: 'Active',
        completed: 1,
        target: 4,
        fraction: 0.25,
      },
      {
        campaignId: 'camp-old',
        title: 'Old',
        factionId: 500001,
        state: 'Completed',
        completed: 30,
        target: 30,
        fraction: 1,
      },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadPlanScheduleInputs, schedulePlan } from '@/features/skills/planner/planSchedule';
import {
  CALENDAR_SKILL_PLAN_KEY,
  loadSkillPlanBoard,
  parseCalendarSkillPlans,
  withCalendarSkillPlan,
} from './calendarSkillPlan';

vi.mock('@/features/skills/planner/planSchedule', () => ({
  loadPlanScheduleInputs: vi.fn(),
  schedulePlan: vi.fn(),
}));

const CHARACTER = 90;
const NOW = Date.parse('2026-09-23T12:00:00Z');

async function seed(chosen: string | undefined) {
  await db.skillPlans.bulkPut([
    { id: 'p1', characterId: CHARACTER, name: 'Loki', entries: [], remapCount: 0, updatedAt: 0 },
    { id: 'p2', characterId: 91, name: 'Other pilot', entries: [], remapCount: 0, updatedAt: 0 },
  ]);
  if (chosen !== undefined) {
    await db.settings.put({ key: CALENDAR_SKILL_PLAN_KEY, value: { [CHARACTER]: chosen } });
  }
}

beforeEach(async () => {
  await db.skillPlans.clear();
  await db.settings.clear();
  vi.mocked(loadPlanScheduleInputs)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(schedulePlan).mockReset();
});

describe('loadSkillPlanBoard', () => {
  it('reads "none" when no plan was chosen, and offers only this Character\'s plans', async () => {
    await seed(undefined);
    const board = await loadSkillPlanBoard(CHARACTER, NOW);
    expect(board.outcome).toEqual({ status: 'none' });
    expect(board.choices).toEqual([{ id: 'p1', name: 'Loki' }]);
  });

  it('reads "none" when the chosen id is stale or another Character\'s', async () => {
    await seed('p2');
    expect((await loadSkillPlanBoard(CHARACTER, NOW)).outcome.status).toBe('none');
    await seed('gone');
    expect((await loadSkillPlanBoard(CHARACTER, NOW)).chosenId).toBeNull();
  });

  it('reads "ready" with an empty schedule as nothing left to train, not as an error', async () => {
    await seed('p1');
    vi.mocked(schedulePlan).mockReturnValue({ scheduled: [], error: null } as never);
    const board = await loadSkillPlanBoard(CHARACTER, NOW);
    expect(board.outcome.status).toBe('ready');
    expect(board.chosenId).toBe('p1');
  });

  it('carries the reason when the plan could not be scheduled', async () => {
    await seed('p1');
    vi.mocked(schedulePlan).mockReturnValue({ scheduled: [], error: 'prereq cycle' } as never);
    expect((await loadSkillPlanBoard(CHARACTER, NOW)).outcome).toEqual({
      status: 'error',
      reason: 'prereq cycle',
    });
  });
});

describe('the plan choice setting', () => {
  it("replaces one Character's plan without touching another's", () => {
    expect(withCalendarSkillPlan({ 1: 'a', 2: 'b' }, 1, 'c')).toEqual({ 1: 'c', 2: 'b' });
    expect(withCalendarSkillPlan({ 1: 'a', 2: 'b' }, 1, null)).toEqual({ 2: 'b' });
  });

  it('drops damaged entries and rejects a non-record', () => {
    expect(parseCalendarSkillPlans({ 1: 'a', 2: 5, 3: '' })).toEqual({ 1: 'a' });
    expect(parseCalendarSkillPlans('x')).toBeNull();
  });
});

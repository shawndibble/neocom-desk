import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { SkillGateMarker } from './SkillGateMarker';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

const INDUSTRY: EngineSkill = {
  typeID: 3380,
  name: 'Industry',
  rank: 1,
  primary: 'memory',
  secondary: 'charisma',
  prereqs: [],
};
const ELECTRONICS: EngineSkill = { ...INDUSTRY, typeID: 45746, name: 'Electronic Engineering' };

vi.mock('@/features/skills/planner/usePlanEditorData', () => ({
  usePlanEditorData: () => ({
    catalog: {
      engineSkills: new Map([
        [3380, INDUSTRY],
        [45746, ELECTRONICS],
      ]),
    },
    trainedSkills: new Map(),
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
  }),
}));

const addEntries = vi.fn(async (entries: readonly PlanEntry[]) => ({
  planId: 'plan-1',
  planName: 'Main plan',
  added: [...entries],
}));
vi.mock('@/features/skills/useTargetPlan', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTargetPlan: (): TargetPlan => ({
    plans: [{ id: 'plan-1', name: 'Main plan', entries: [] } as never],
    targetPlanId: 'plan-1',
    setTargetPlanId: vi.fn(),
    addEntries,
    removeEntries: vi.fn(async () => {}),
  }),
}));

const nameForSkill = (typeID: number) =>
  typeID === 3380 ? 'Industry' : typeID === 45746 ? 'Electronic Engineering' : `#${typeID}`;
const nameForCharacter = (id: number) => (id === 7 ? 'Vex Kado' : `#${id}`);

function renderMarker(verdict: Extract<SkillGateVerdict, { gated: true }>) {
  return render(
    <MemoryRouter>
      <SkillGateMarker
        verdict={verdict}
        nameForSkill={nameForSkill}
        nameForCharacter={nameForCharacter}
      />
    </MemoryRouter>
  );
}

describe('SkillGateMarker', () => {
  it('names the skill and level when exactly one requirement is unmet', () => {
    renderMarker({
      gated: true,
      shortfall: [{ typeID: 3380, haveLevel: 2, needLevel: 5 }],
      bestCharacterId: 7,
    });
    expect(screen.getByRole('button', { name: /Industry V/ })).toBeInTheDocument();
  });

  it('collapses to a count when more than one requirement is unmet', () => {
    renderMarker({
      gated: true,
      shortfall: [
        { typeID: 3380, haveLevel: 2, needLevel: 5 },
        { typeID: 45746, haveLevel: 0, needLevel: 3 },
      ],
      bestCharacterId: 7,
    });
    expect(screen.getByText('2 skills short')).toBeInTheDocument();
  });

  it('opens a popover with each unmet skill, its train time and the closest character', async () => {
    const user = userEvent.setup();
    renderMarker({
      gated: true,
      shortfall: [{ typeID: 45746, haveLevel: 0, needLevel: 3 }],
      bestCharacterId: 7,
    });
    await user.click(screen.getByRole('button', { name: /Electronic Engineering III/ }));
    expect(
      await screen.findByText('No character on this account can install this job')
    ).toBeInTheDocument();
    // The skill name is a link into the Skill modal.
    expect(screen.getByRole('link', { name: 'Electronic Engineering' })).toBeInTheDocument();
    expect(screen.getByText('— → III')).toBeInTheDocument();
    expect(screen.getByText(/Closest: Vex Kado · .* to train/)).toBeInTheDocument();
  });

  it('adds the missing skills to the Skill Plan', async () => {
    const user = userEvent.setup();
    renderMarker({
      gated: true,
      shortfall: [{ typeID: 45746, haveLevel: 0, needLevel: 3 }],
      bestCharacterId: 7,
    });
    await user.click(screen.getByRole('button', { name: /Electronic Engineering III/ }));
    await user.click(await screen.findByRole('button', { name: 'Add all to Skill Plan' }));
    expect(addEntries).toHaveBeenCalledWith(
      [{ skillTypeID: 45746, targetLevel: 3 }],
      'Industry skills'
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Added 1 skill to Main plan');
  });
});

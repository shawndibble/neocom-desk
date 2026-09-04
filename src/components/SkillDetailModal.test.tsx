import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { SkillDetailModal } from './SkillDetailModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { SkillType } from '@/sde/types';

const CHAR_ID = 91;

const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 1,
    name: 'Small Hybrid Turret',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: 2,
    name: 'Frigate',
    description: 'Pilots a <b>Frigate</b>-class starship.',
    groupID: 20,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 3 }],
  },
  {
    typeID: 3,
    name: 'Solo Skill',
    description: '',
    groupID: 30,
    groupName: 'Misc',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  useSkillDetailModalStore.setState({ request: null });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

function mockSkills(
  characterId: number,
  skills: { skill_id: number; trained_skill_level: number }[]
) {
  server.use(
    http.get(`${ESI_BASE_URL}/characters/${characterId}/skills`, () =>
      HttpResponse.json({
        skills: skills.map((s) => ({ ...s, skillpoints_in_skill: 1000 })),
        total_sp: 1000 * skills.length,
        unallocated_sp: 0,
      })
    )
  );
}

describe('SkillDetailModal', () => {
  it('renders nothing when no request is open', () => {
    render(<SkillDetailModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows description, prerequisites (trained vs. needed), and unlocks for a skill type id', async () => {
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
    mockSkills(CHAR_ID, [{ skill_id: 1, trained_skill_level: 5 }]);

    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(2));

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Frigate');
    expect(within(dialog).getByText('Pilots a Frigate-class starship.')).toBeInTheDocument();
    expect(within(dialog).getByText('Small Hybrid Turret')).toBeInTheDocument();
    expect(within(dialog).getByText('Trained · Level 3')).toBeInTheDocument();
  });

  it('shows a prerequisite as still needed when the trained level falls short', async () => {
    useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
    mockSkills(CHAR_ID, [{ skill_id: 1, trained_skill_level: 1 }]);

    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(2));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Level 3')).toBeInTheDocument();
  });

  it('handles a skill with no prerequisites and no unlocks gracefully', async () => {
    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(3));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No prerequisites')).toBeInTheDocument();
    expect(within(dialog).getByText("Doesn't unlock anything yet")).toBeInTheDocument();
  });

  it('works with no active character, showing every prerequisite as not yet trained', async () => {
    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(2));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Level 3')).toBeInTheDocument();
  });

  it('shows an empty state for an unknown skill type id', async () => {
    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(99999));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Could not load')).toBeInTheDocument();
  });

  it('close() from the store hides the dialog', async () => {
    render(<SkillDetailModal />);
    act(() => useSkillDetailModalStore.getState().open(3));
    await screen.findByRole('dialog');

    act(() => useSkillDetailModalStore.getState().close());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

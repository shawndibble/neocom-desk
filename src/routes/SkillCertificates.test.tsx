import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { EngineSkill } from '@/engine/types';
import type { SkillCatalog } from '@/features/skills/skillMap';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { Certificate } from '@/sde/types';
import { SkillCertificates } from './SkillCertificates';

const CHAR_ID = 93;

function ladder(skillTypeID: number): Certificate['levels'] {
  return [1, 2, 3, 4, 5].map((level) => [{ skillTypeID, level }]);
}

const CERTS: Certificate[] = [
  {
    id: 1,
    name: 'Armor Tanking',
    description: 'Competence in armor buffers.',
    groupId: 1210,
    groupName: 'Armor',
    levels: ladder(10),
  },
  {
    id: 2,
    name: 'Navigation',
    description: 'Competence in moving about.',
    groupId: 275,
    groupName: 'Navigation',
    levels: ladder(20),
  },
];

function skill(typeID: number, name: string, alphaMaxLevel?: number): EngineSkill {
  return {
    typeID,
    name,
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [],
    ...(alphaMaxLevel !== undefined ? { alphaMaxLevel } : {}),
  } as unknown as EngineSkill;
}

const ENGINE_SKILLS = new Map([
  [10, skill(10, 'Hull Upgrades', 4)],
  [20, skill(20, 'Navigation', 2)],
]);
const CATALOG = {
  engineSkills: ENGINE_SKILLS,
  bySkillTypeID: new Map([
    [10, { name: 'Hull Upgrades' }],
    [20, { name: 'Navigation' }],
  ]),
} as unknown as SkillCatalog;

const data = {
  cloneState: 'omega' as 'omega' | 'alpha',
  fetchedAt: null as Date | null,
  refresh: vi.fn(),
};

vi.mock('@/features/skills/certificates/useCertificatesData', () => ({
  useCertificatesData: () => ({
    load: { status: 'ready', certificates: CERTS },
    catalog: CATALOG,
    // Armor Tanking at Elite; Navigation at Standard.
    trainedSkills: new Map([
      [10, { level: 5, sp: 0 }],
      [20, { level: 2, sp: 0 }],
    ]),
    skillsKnown: true,
    attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
    implants: {},
    cloneState: data.cloneState,
    fetchedAt: data.fetchedAt,
    refresh: data.refresh,
  }),
}));

beforeEach(async () => {
  await db.skillPlans.clear();
  data.cloneState = 'omega';
  data.fetchedAt = null;
  data.refresh = vi.fn();
  useActiveCharacter.setState({ activeCharacterId: CHAR_ID, hydrated: true });
});

function renderPage() {
  render(
    <MemoryRouter>
      <SkillCertificates />
    </MemoryRouter>
  );
}

describe('SkillCertificates', () => {
  it('grades each certificate, lowest grade first', async () => {
    renderPage();
    expect(await screen.findByText('Standard (2 of 5)')).toBeInTheDocument();
    expect(screen.getByText('Elite: nothing left to train')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText(/Improved needs 1 skill level/)).toBeInTheDocument();
  });

  it('labels the filters as a group, not a toolbar', async () => {
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    expect(screen.getByRole('group', { name: 'Certificate filters' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('filters by grade, each option carrying its count', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    await user.click(screen.getByRole('button', { name: /^Grade/ }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Elite (1)' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Armor Tanking')).not.toBeInTheDocument();
    expect(screen.getByText('Navigation', { selector: 'span' })).toBeInTheDocument();
  });

  it('expands a certificate to list what its next grade needs', async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = await screen.findByRole('button', {
      name: 'What Improved needs for Navigation',
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Competence in moving about.')).toBeInTheDocument();
    expect(screen.getByText('Missing for Improved')).toBeInTheDocument();
    expect(screen.getByText('Navigation III')).toBeInTheDocument();
  });

  it('opens an Elite certificate for its description alone', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'About Armor Tanking' }));
    expect(screen.getByText('Competence in armor buffers.')).toBeInTheDocument();
    expect(screen.queryByText(/^Missing for/)).not.toBeInTheDocument();
  });

  it('adds the next grade to a Skill Plan and offers Undo', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Add Improved to plan' }));
    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0].entries).toEqual([{ skillTypeID: 20, targetLevel: 3 }]);
    });
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(await screen.findByText('In plan')).toBeInTheDocument();
  });

  it('marks a grade an Alpha clone cannot reach, only for an Alpha character', async () => {
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    expect(screen.queryByRole('button', { name: 'Omega only' })).not.toBeInTheDocument();
  });

  it('badges the page header with the skills read age', async () => {
    data.fetchedAt = new Date(Date.now() - 12 * 60_000);
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    expect(screen.getByText('12m ago')).toBeInTheDocument();
  });

  it('shows no age badge before any skills read, but still offers Refresh', async () => {
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    expect(screen.queryByText(/ ago$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('re-reads skills on Refresh, keeping the rows on screen', async () => {
    const user = userEvent.setup();
    data.fetchedAt = new Date(Date.now() - 12 * 60_000);
    renderPage();
    await screen.findByText('Standard (2 of 5)');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(data.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Standard (2 of 5)')).toBeInTheDocument();
  });

  it('shows Omega only where the Alpha cap stops the next grade', async () => {
    data.cloneState = 'alpha';
    renderPage();
    const omegaOnly = await screen.findByRole('button', { name: 'Omega only' });
    expect(omegaOnly).toBeDisabled();
    const row = omegaOnly.closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(/Navigation III need Omega/)).toBeInTheDocument();
  });
});

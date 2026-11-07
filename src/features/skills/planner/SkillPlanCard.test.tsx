import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { CertifiedPlan } from '@/sde/types';
import { newPlan } from './newPlan';
import { SkillPlanCard } from './SkillPlanCard';

vi.mock('./usePlanEditorData', () => ({
  usePlanEditorData: () => ({ loaded: true, trainedSkills: new Map(), trainedSkillsKnown: false }),
}));

const CERTIFIED: CertifiedPlan = {
  id: 14,
  name: 'Manufacturer',
  description: 'Builds things.',
  careerPathId: 5,
  entries: [{ skillTypeID: 3380, level: 1 }],
  milestones: [],
};

vi.mock('@/sde/loadSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadSde')>()),
  loadCertifiedPlans: vi.fn(async () => [CERTIFIED]),
  loadSkills: vi.fn(async () => [{ typeID: 3380, name: 'Industry' }]),
}));

const CHAR_ID = 93;

function renderCard() {
  render(
    <MemoryRouter initialEntries={['/skills']}>
      <Routes>
        <Route
          path="/skills"
          element={<SkillPlanCard activeCharacterId={CHAR_ID} remapInfo={null} />}
        />
        <Route path="/ships/tree" element={<p>Ship Tree open</p>} />
        <Route path="/skills/plans/:planId" element={<p>Editor open</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.skillPlans.clear();
});

describe('SkillPlanCard: no plans yet (#6000)', () => {
  it('links the Ship Tree from the start hint', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('link', { name: 'Ship Tree' }));

    expect(await screen.findByText('Ship Tree open')).toBeInTheDocument();
  });

  it('opens the Certified Plan picker from the start hint, and only one', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Certified Plan' }));

    expect(await screen.findByRole('radio', { name: /Manufacturer/ })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('shows the current plan, not the hint, once a plan exists', async () => {
    await db.skillPlans.add({ ...newPlan(CHAR_ID, 'Frigates', 0), entries: [] });
    renderCard();

    expect(await screen.findByText('Frigates')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ship Tree' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Certified Plan' })).not.toBeInTheDocument();
  });
});

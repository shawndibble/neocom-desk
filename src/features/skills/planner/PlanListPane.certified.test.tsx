import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { CertifiedPlan } from '@/sde/types';
import { PlanListPane } from './PlanListPane';

const PLAN: CertifiedPlan = {
  id: 14,
  name: 'Manufacturer',
  description: 'Builds things.',
  careerPathId: 5,
  entries: [
    { skillTypeID: 3380, level: 1 },
    { skillTypeID: 3380, level: 2 },
  ],
  milestones: [{ skillTypeID: 3380, level: 2 }],
};

vi.mock('@/sde/loadSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadSde')>()),
  loadCertifiedPlans: vi.fn(async () => [PLAN]),
  loadSkills: vi.fn(async () => [{ typeID: 3380, name: 'Industry' }]),
}));

const CHAR_ID = 92;

beforeEach(async () => {
  await db.skillPlans.clear();
});

describe('PlanListPane: new plan from a Certified Plan (#2392)', () => {
  it('creates the picked plan with its entries and milestones, then opens it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/skills/plans']}>
        <Routes>
          <Route
            path="/skills/plans"
            element={<PlanListPane activeCharacterId={CHAR_ID} remapInfo={null} />}
          />
          <Route path="/skills/plans/:planId" element={<p>Editor open</p>} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'More ways to start a plan' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From a Certified Plan…' }));
    await user.click(await screen.findByRole('button', { name: /Manufacturer/ }));
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(await screen.findByText('Editor open')).toBeInTheDocument();
    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe('Manufacturer');
      expect(plans[0].entries).toEqual([
        { skillTypeID: 3380, targetLevel: 1 },
        { skillTypeID: 3380, targetLevel: 2 },
      ]);
      expect(plans[0].milestones?.map((m) => m.name)).toEqual(['Industry II']);
    });
  });
});

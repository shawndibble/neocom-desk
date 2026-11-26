import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { writeLocal } from '@/lib/safeLocalStorage';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';

const PLAN_ID = 'mockup-plan-editor-phone';
const characterId = SAMPLE_ACTIVE_CHARACTER.characterId;

const entries = [
  ...[3, 4, 5].map((targetLevel) => ({ skillTypeID: 3338, targetLevel })),
  ...[3, 4].map((targetLevel) => ({ skillTypeID: 20212, targetLevel })),
  ...[4, 5].map((targetLevel) => ({ skillTypeID: 3441, targetLevel })),
];

async function seed() {
  writeLocal(`standingsScopeNoticeDismissed:${characterId}`, '1');
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: 'Missile skills',
    entries,
    remapCount: 1,
    updatedAt: Date.now(),
  });
}

const meta = {
  title: 'mockups/PlanEditorPhone',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: { path: `/skills/plans/${PLAN_ID}`, seed },
  },
  render: () => (
    <Routes>
      <Route path="skills/plans" element={<SkillPlans />} />
      <Route path="skills/plans/:planId" element={<SkillPlanEditor />} />
    </Routes>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

export const Proposed: Story = { globals: phone };

export const ProposedMenuOpen: Story = {
  globals: phone,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole(
        'button',
        { name: /more actions/i },
        { timeout: 10_000 }
      )
    );
  },
};

export const Desktop: Story = {};

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

/** Consecutive levels of one skill, so the phone can group them. */
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

/**
 * Issue #6562: the Skill Plan Editor on a phone. Chosen (Shawn's review,
 * 2026-11): consecutive levels of one skill fold into a group under the
 * skill's name, each level keeping its own drag grip, time and ⋮ (reorder
 * stays drag-only); Import and Export fold into the header ⋮.
 *
 * New components in this mockup: none. The grouped rows are the real editor
 * rows; the header menu is the existing `HeaderMoreMenu`.
 */
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

/** @summary Proposed on a phone: levels grouped under each skill, Import/Export in the header ⋮. */
export const Proposed: Story = { globals: phone };

/** @summary Proposed on a phone with the header ⋮ open. */
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

/** @summary Desktop is unchanged: one full row per level, Import and Export buttons. */
export const Desktop: Story = {};

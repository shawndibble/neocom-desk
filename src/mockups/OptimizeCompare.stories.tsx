import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { writeLocal } from '@/lib/safeLocalStorage';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { MIXED_QUEUE, QUEUE_REMAP_SCOPES, queueRemapRoutes } from './queueRemapFixtures';
import { CompareModalMockup } from './optimizeCompareParts';

const PLAN_ID = 'mockup-optimize-plan';
const characterId = SAMPLE_ACTIVE_CHARACTER.characterId;

async function seedPlan() {
  writeLocal(`standingsScopeNoticeDismissed:${characterId}`, '1');
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: 'Missile pilot',
    entries: MIXED_QUEUE.map((s) => ({ skillTypeID: s.skillTypeID, targetLevel: s.level })),
    remapCount: 1,
    updatedAt: Date.now(),
  });
}

const editor = (
  <Routes>
    <Route path="skills/plans/:planId" element={<SkillPlanEditor />} />
  </Routes>
);

/**
 * Optimize for me's preview, side by side with the plan it would replace.
 * Today the Accept/Reject Modal sits over the Plan editor and lists only the
 * new order, so the pilot cannot see what changed. Researched on Mobbin:
 * Semrush "Review your content" and Mistral "Review your changes" (Original
 * | New columns, changed rows tinted, Accept at the foot), Linear and Plane
 * version compare (highlight what changed), Figma "Compare changes".
 *
 * Sample data (`optimizeCompareFixtures.ts`). New components in this mockup:
 * none. `CompareList` is a plain list of `Pill`s over the existing `Modal`
 * (`wide`).
 */
const meta = {
  title: 'mockups/OptimizeCompare',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: {
      path: `/skills/plans/${PLAN_ID}`,
      routes: queueRemapRoutes('ready'),
      scopes: QUEUE_REMAP_SCOPES,
      seed: seedPlan,
    },
  },
  render: () => editor,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today: the Optimize menu's "Optimize for me…" preview covers the plan and shows only the new order. */
export const Today: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /^optimize$/i }, { timeout: 10_000 })
    );
    await userEvent.click(await within(document.body).findByText(/optimize for me…/i));
  },
};

/** @summary Proposed: the Modal widens to two columns, Current and Optimized, changed rows tinted, new remap markers dashed. */
export const ModalColumns: Story = {
  render: () => (
    <>
      {editor}
      <CompareModalMockup />
    </>
  ),
};

/** @summary Proposed on a phone: a Current / Optimized switch, Optimized first. */
export const ModalColumnsPhone: Story = {
  globals: phone,
  render: () => (
    <>
      {editor}
      <CompareModalMockup />
    </>
  ),
};

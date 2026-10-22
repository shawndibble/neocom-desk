import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { writeLocal } from '@/lib/safeLocalStorage';
import { formatLocalDate } from '@/lib/localDate';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import {
  MIXED_QUEUE,
  QUEUE_REMAP_SCOPES,
  queueRemapRoutes,
  type ScenarioName,
} from './queueRemapFixtures';
import { IntoAttributesPanel, QueueRemapAdviceModal, RemapAdviceAction } from './queueRemapParts';

const PLAN_ID = 'mockup-queue-plan';
const characterId = SAMPLE_ACTIVE_CHARACTER.characterId;

/** The standings notice is another page's concern; it would push the queue down every shot. */
function quietShell() {
  writeLocal(`standingsScopeNoticeDismissed:${characterId}`, '1');
}

async function seedNoPlans() {
  quietShell();
  await db.skillPlans.clear();
}

const queueEntries = MIXED_QUEUE.map((s) => ({ skillTypeID: s.skillTypeID, targetLevel: s.level }));

/** Today's path: a plan the pilot made, then Import › From skill queue. */
async function seedImportedPlan() {
  quietShell();
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: 'Untitled plan',
    entries: queueEntries,
    remapCount: 1,
    updatedAt: Date.now(),
  });
}

/**
 * Option A's hand-off: the queue saved as a plan, the advice kept as a Remap
 * Marker. Fixed rather than computed in the seed (the SDE can't load in the
 * jsdom story test): it is what `placeRemaps` answers for this queue with one
 * remap, as `AdviceReady` shows: remap before Shield Management V (entry 6).
 */
async function seedSavedAdvice() {
  quietShell();
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: `Skill queue · ${formatLocalDate(new Date())}`,
    entries: queueEntries,
    remapCount: 1,
    markers: [6],
    markerAttributes: [
      { memory: 27, intelligence: 21, perception: 17, willpower: 17, charisma: 17 },
    ],
    updatedAt: Date.now(),
  });
}

/** Option B's landing: the queue saved as a plan, nothing optimized yet. */
async function seedOptimizeInPlan() {
  quietShell();
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: `Skill queue · ${formatLocalDate(new Date())}`,
    entries: queueEntries,
    remapCount: 1,
    updatedAt: Date.now(),
  });
}

// Module-level so the shell's effect sees stable references.
const ROUTES: Record<ScenarioName, ReturnType<typeof queueRemapRoutes>> = {
  ready: queueRemapRoutes('ready'),
  cooldown: queueRemapRoutes('cooldown'),
  bonus: queueRemapRoutes('bonus'),
  optimal: queueRemapRoutes('optimal'),
  empty: queueRemapRoutes('empty'),
};

const queuePage = (scenario: ScenarioName) => ({
  path: '/skills/plans',
  routes: ROUTES[scenario],
  scopes: QUEUE_REMAP_SCOPES,
  seed: seedNoPlans,
});

const editorPage = (seed: () => Promise<void>) => ({
  path: `/skills/plans/${PLAN_ID}`,
  routes: ROUTES.ready,
  scopes: QUEUE_REMAP_SCOPES,
  seed,
});

const pages = (
  <Routes>
    <Route path="skills/plans" element={<SkillPlans />} />
    <Route path="skills/plans/:planId" element={<SkillPlanEditor />} />
  </Routes>
);

const withAction = (label?: string) => (
  <>
    {pages}
    <IntoAttributesPanel>
      <RemapAdviceAction label={label} />
    </IntoAttributesPanel>
  </>
);

const withAdvice = (scenario: ScenarioName) => (
  <>
    {withAction()}
    <QueueRemapAdviceModal scenario={scenario} />
  </>
);

const openOptimize = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: /^optimize$/i }, { timeout: 10_000 })
  );
};

/**
 * Issue #4701: attribute remap advice for the current skill queue.
 *
 * Today, the optimizer lives only in the Skill Plan editor: make a plan,
 * Import › From skill queue, then Optimize. The real pages render here against
 * a sample missile pilot (`queueRemapFixtures.ts`); every figure in the
 * proposed modal is the planner's own `placeRemaps` run on that queue.
 *
 * Option A, "Preview from queue": a Remap advice button in the Attributes
 * panel opens the advice for the queue as it stands. Option B: the same spot
 * holds "Optimize in a plan", which saves the queue as a plan and opens the
 * editor with Optimize ready.
 *
 * New components in this mockup:
 * - `Remap advice action`: an existing `Button` in a new place (Attributes panel, under the remap budget).
 * - `QueueRemapAdvice`: the modal body; `RemapPreviewModal`'s layout with a queue framing and no Accept.
 */
const meta = {
  title: 'mockups/QueueRemap',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: queuePage('ready') },
  render: () => pages,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today: Skills › Plans, the live queue with the plan card and Attributes beside it. No remap advice here. */
export const Today: Story = {};

/** @summary Today on a phone. */
export const TodayPhone: Story = { globals: phone };

/** @summary Today: the queue imported into a plan, Optimize menu open, the only way to a remap. */
export const TodayPlanOptimize: Story = {
  parameters: { shell: editorPage(seedImportedPlan) },
  play: openOptimize,
};

/** @summary A: Remap advice under the remap budget in the Attributes panel. New component: Remap advice action. */
export const AdviceAction: Story = { render: () => withAction() };

/** @summary A on a phone: the button under the attribute chips. */
export const AdviceActionPhone: Story = { render: () => withAction(), globals: phone };

/** @summary A: yearly remap ready. Remap now to Perception/Willpower. New component: QueueRemapAdvice. */
export const AdviceReady: Story = { render: () => withAdvice('ready') };

/** @summary A on a phone, yearly remap ready. */
export const AdviceReadyPhone: Story = { render: () => withAdvice('ready'), globals: phone };

/** @summary A: yearly remap on cooldown. Keep current attributes, then remap once it's ready. */
export const AdviceCooldown: Story = {
  parameters: { shell: queuePage('cooldown') },
  render: () => withAdvice('cooldown'),
};

/** @summary A: a bonus remap plus the yearly one. Two remaps, one per attribute block. */
export const AdviceBonus: Story = {
  parameters: { shell: queuePage('bonus') },
  render: () => withAdvice('bonus'),
};

/** @summary A: attributes already suit the queue. Nothing to save. */
export const AdviceOptimal: Story = {
  parameters: { shell: queuePage('optimal') },
  render: () => withAdvice('optimal'),
};

/** @summary A: empty queue. */
export const AdviceEmpty: Story = {
  parameters: { shell: queuePage('empty') },
  render: () => withAdvice('empty'),
};

/** @summary A: after Save as skill plan. A new plan named for the queue, the advice placed as Remap Markers, its editor open. */
export const AdviceSavedAsPlan: Story = { parameters: { shell: editorPage(seedSavedAdvice) } };

/** @summary B: the same spot reads Optimize in a plan. */
export const AltAction: Story = { render: () => withAction('Optimize in a plan') };

/** @summary B's landing: the queue saved as a plan, its editor open with Optimize ready. */
export const AltLanding: Story = {
  parameters: { shell: editorPage(seedOptimizeInPlan) },
  play: openOptimize,
};

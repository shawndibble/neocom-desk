import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { userEvent, within } from 'storybook/test';
import { db } from '@/db';
import { writeLocal } from '@/lib/safeLocalStorage';
import { formatLocalDate } from '@/lib/localDate';
import { loadSkillCatalog } from '@/features/skills/skillMap';
import { SkillPlans } from '@/routes/SkillPlans';
import { SkillPlanEditor } from '@/routes/SkillPlanEditor';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import {
  MIXED_QUEUE,
  QUEUE_REMAP_SCOPES,
  queueRemapRoutes,
  type ScenarioName,
} from './queueRemapFixtures';
import { adviceMarkers, queueAdvice } from './queueRemapAdvice';
import { OptimizeQueueButton, OptimizeQueueToast } from './queueRemapParts';

const PLAN_ID = 'mockup-queue-plan';
const characterId = SAMPLE_ACTIVE_CHARACTER.characterId;
const PLAN_NAME = `Skill queue · ${formatLocalDate(new Date())}`;

/** The standings notice is another page's concern; it would push the queue down every shot. */
function quietShell() {
  writeLocal(`standingsScopeNoticeDismissed:${characterId}`, '1');
}

async function seedNoPlans() {
  quietShell();
  await db.skillPlans.clear();
}

/** Two plans the pilot already keeps, so the panel shows its current plan and All plans. */
async function seedExistingPlans() {
  quietShell();
  await db.skillPlans.clear();
  await db.skillPlans.bulkPut([
    {
      id: 'mockup-golem',
      characterId,
      name: 'Golem',
      entries: [
        { skillTypeID: 3338, targetLevel: 5 },
        { skillTypeID: 20212, targetLevel: 4 },
      ],
      remapCount: 1,
      updatedAt: Date.now(),
    },
    {
      id: 'mockup-drones',
      characterId,
      name: 'Drone support',
      entries: [{ skillTypeID: 3441, targetLevel: 5 }],
      remapCount: 1,
      updatedAt: Date.now() - 86_400_000,
    },
  ]);
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
 * What one press of Optimize queue writes: the queue as a plan, the
 * optimizer's remaps placed as Remap Markers. The markers come from the same
 * `placeRemaps` run as the toast; where the SDE can't load (the jsdom story
 * test) the plan is written without them.
 */
const seedLanding = (scenario: ScenarioName) => async () => {
  quietShell();
  let markers = {};
  try {
    const { engineSkills } = await loadSkillCatalog();
    markers = adviceMarkers(queueAdvice(scenario, engineSkills, Date.now()));
  } catch {
    // No SDE in jsdom: the story still renders the editor.
  }
  await db.skillPlans.clear();
  await db.skillPlans.put({
    id: PLAN_ID,
    characterId,
    name: PLAN_NAME,
    entries: queueEntries,
    remapCount: 1,
    ...markers,
    updatedAt: Date.now(),
  });
};

// Module-level so the shell's effect sees stable references.
const ROUTES: Record<ScenarioName, ReturnType<typeof queueRemapRoutes>> = {
  ready: queueRemapRoutes('ready'),
  cooldown: queueRemapRoutes('cooldown'),
  bonus: queueRemapRoutes('bonus'),
  optimal: queueRemapRoutes('optimal'),
  empty: queueRemapRoutes('empty'),
};
const SEEDS = {
  ready: seedLanding('ready'),
  cooldown: seedLanding('cooldown'),
  bonus: seedLanding('bonus'),
};

const queuePage = (scenario: ScenarioName, seed = seedNoPlans) => ({
  path: '/skills/plans',
  routes: ROUTES[scenario],
  scopes: QUEUE_REMAP_SCOPES,
  seed,
});

const editorPage = (scenario: ScenarioName, seed: () => Promise<void>) => ({
  path: `/skills/plans/${PLAN_ID}`,
  routes: ROUTES[scenario],
  scopes: QUEUE_REMAP_SCOPES,
  seed,
});

const pages = (
  <Routes>
    <Route path="skills/plans" element={<SkillPlans />} />
    <Route path="skills/plans/:planId" element={<SkillPlanEditor />} />
  </Routes>
);

const withButton = (emptyQueue = false) => (
  <>
    {pages}
    <OptimizeQueueButton emptyQueue={emptyQueue} />
  </>
);

const landing = (scenario: ScenarioName) => (
  <>
    {pages}
    <OptimizeQueueToast scenario={scenario} planName={PLAN_NAME} />
  </>
);

const openOptimize = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: /^optimize$/i }, { timeout: 10_000 })
  );
};

/**
 * Issue #4701: remap advice for the current skill queue. Chosen flow (Shawn,
 * 2026-10-21): one press of **Optimize queue**, at the foot of the Attributes
 * card, makes a plan from the queue, runs the optimizer (`placeRemaps`,
 * leaving out the level training now as the editor does), places its remaps
 * as Remap Markers and opens that plan, with an Undo toast naming what it did.
 *
 * The real Skills › Plans page and Plan editor render against a sample
 * missile pilot (`queueRemapFixtures.ts`); every figure is the planner's own.
 *
 * New components in this mockup: none. The button is an existing `Button`
 * at the Attributes card's full width under the remap budget, past a divider;
 * the landing note is the existing `Toast`.
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
  parameters: { shell: editorPage('ready', seedImportedPlan) },
  play: openOptimize,
};

/** @summary Optimize queue at the foot of the Attributes card, no plans yet. */
export const Button: Story = { render: () => withButton() };

/** @summary Optimize queue under the attribute chips on a phone. */
export const ButtonPhone: Story = { render: () => withButton(), globals: phone };

/** @summary With plans already kept: the Skill Plan panel is untouched, Optimize queue stays in Attributes. */
export const ButtonWithPlans: Story = {
  parameters: { shell: queuePage('ready', seedExistingPlans) },
  render: () => withButton(),
};

/** @summary The same with plans on a phone. */
export const ButtonWithPlansPhone: Story = {
  parameters: { shell: queuePage('ready', seedExistingPlans) },
  render: () => withButton(),
  globals: phone,
};

/** @summary Empty queue: Optimize queue is aria-disabled and its tooltip says why. */
export const EmptyQueue: Story = {
  parameters: { shell: queuePage('empty') },
  render: () => withButton(true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole(
      'button',
      { name: /optimize queue/i },
      { timeout: 10_000 }
    );
    button.focus();
  },
};

/** @summary Landing: the new plan, its Remap Marker before Shield Management V, Remap savings in the header, an Undo toast. */
export const Landing: Story = {
  parameters: { shell: editorPage('ready', SEEDS.ready) },
  render: () => landing('ready'),
};

/** @summary Landing on a phone. */
export const LandingPhone: Story = {
  parameters: { shell: editorPage('ready', SEEDS.ready) },
  render: () => landing('ready'),
  globals: phone,
};

/** @summary Landing with the yearly remap on cooldown: the marker waits for its date, and the toast says so. */
export const LandingCooldown: Story = {
  parameters: { shell: editorPage('cooldown', SEEDS.cooldown) },
  render: () => landing('cooldown'),
};

/** @summary Landing with a bonus remap too: two markers, one per attribute block. */
export const LandingBonus: Story = {
  parameters: { shell: editorPage('bonus', SEEDS.bonus) },
  render: () => landing('bonus'),
};

/** @summary Attributes already suit the queue: no plan is made, a plain toast on the Plans page says why. */
export const AlreadyOptimal: Story = {
  parameters: { shell: queuePage('optimal') },
  render: () => (
    <>
      {withButton()}
      <OptimizeQueueToast scenario="optimal" planName={PLAN_NAME} />
    </>
  ),
};

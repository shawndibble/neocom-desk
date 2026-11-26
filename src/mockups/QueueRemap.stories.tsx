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
import { DAY_MS } from '@/lib/age';

const PLAN_ID = 'mockup-queue-plan';
const characterId = SAMPLE_ACTIVE_CHARACTER.characterId;
const PLAN_NAME = `Skill queue · ${formatLocalDate(new Date())}`;

function quietShell() {
  writeLocal(`standingsScopeNoticeDismissed:${characterId}`, '1');
}

async function seedNoPlans() {
  quietShell();
  await db.skillPlans.clear();
}

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
      updatedAt: Date.now() - DAY_MS,
    },
  ]);
}

const queueEntries = MIXED_QUEUE.map((s) => ({ skillTypeID: s.skillTypeID, targetLevel: s.level }));

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

const seedLanding = (scenario: ScenarioName) => async () => {
  quietShell();
  let markers = {};
  try {
    const { engineSkills } = await loadSkillCatalog();
    markers = adviceMarkers(queueAdvice(scenario, engineSkills, Date.now()));
  } catch {}
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

const meta = {
  title: 'mockups/QueueRemap',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: queuePage('ready') },
  render: () => pages,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

export const Today: Story = {};

export const TodayPhone: Story = { globals: phone };

export const TodayPlanOptimize: Story = {
  parameters: { shell: editorPage('ready', seedImportedPlan) },
  play: openOptimize,
};

export const Button: Story = { render: () => withButton() };

export const ButtonPhone: Story = { render: () => withButton(), globals: phone };

export const ButtonWithPlans: Story = {
  parameters: { shell: queuePage('ready', seedExistingPlans) },
  render: () => withButton(),
};

export const ButtonWithPlansPhone: Story = {
  parameters: { shell: queuePage('ready', seedExistingPlans) },
  render: () => withButton(),
  globals: phone,
};

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

export const Landing: Story = {
  parameters: { shell: editorPage('ready', SEEDS.ready) },
  render: () => landing('ready'),
};

export const LandingPhone: Story = {
  parameters: { shell: editorPage('ready', SEEDS.ready) },
  render: () => landing('ready'),
  globals: phone,
};

export const LandingCooldown: Story = {
  parameters: { shell: editorPage('cooldown', SEEDS.cooldown) },
  render: () => landing('cooldown'),
};

export const LandingBonus: Story = {
  parameters: { shell: editorPage('bonus', SEEDS.bonus) },
  render: () => landing('bonus'),
};

export const AlreadyOptimal: Story = {
  parameters: { shell: queuePage('optimal') },
  render: () => (
    <>
      {withButton()}
      <OptimizeQueueToast scenario="optimal" planName={PLAN_NAME} />
    </>
  ),
};

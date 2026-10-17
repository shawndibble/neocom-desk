import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Route, Routes } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Caret } from '@/components/ui';
import { db, type BuildPlanRecord } from '@/db';
import { IndustryPlanPage } from '@/routes/IndustryPlanPage';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { haulingFixtureRoutes } from '@/storybook/haulingFixtures';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T4, plan and group pages): the slot line under the plan hero
 * schedules the whole job tree on the active Character's free slots, one job
 * per plan node, a parent after its sub-jobs: "Uses 6 slots · done by Thu
 * 14:20 · Show plan". "Show plan" expands in the same line into the waves
 * ("Now: 4 reactions · Wed 09:00: 6 parts · Thu 02:00: final item") and the
 * note "Sub-jobs are timed at TE 0". A Build Group's slot line reads the same.
 *
 * The plan is a Jaguar built from its hull, R.A.M. and four components, with
 * the four composites they use reacted here (Include Reactions, Build here).
 *
 * New components in this mockup: `PlanScheduleLine` (replaces today's
 * `PlanSlotLine` text, with its in-line "Show plan" disclosure). Everything
 * else is the real plan page.
 */

const PLAN_ID = 'mock-slot-plan';
const JAGUAR_BLUEPRINT = 11401;
const JAGUAR = 11400;
/** Lowsec, for the reactions: highsec structures cannot run them. */
const TAMA = 30002813;

/** Hull, R.A.M., four components: the six parts. */
const PARTS = [587, 11478, 11548, 11542, 11555, 11530];
/** Fernite Carbide, Fermionic Condensates, Sylramic Fibers, Ferrogel: the four reactions. */
const REACTIONS = [16673, 17317, 16678, 16683];
const REACTION_FORMULAS = [46206, 46208, 46213, 46214];
/** Rifter and the five component blueprints, owned as originals. */
const PART_BLUEPRINTS = [691, 11890, 17324, 17342, 17346, 17355];

/** Jita lowest sell for what the tree prices; anything else falls back to 400 ISK. */
const PRICES: Record<number, number> = {
  [JAGUAR]: 11_900_000,
  587: 420_000,
  11478: 6_900,
  11548: 112_000,
  11542: 1_250,
  11555: 21_500,
  11530: 39_000,
  11536: 41_500,
  11538: 9_400,
  11551: 14_800,
  3828: 2_150,
  11399: 9_800,
  16673: 160,
  17317: 6_400,
  16678: 290,
  16683: 3_900,
  4246: 16_500,
  4247: 16_800,
  34: 4.12,
  35: 9.8,
  36: 48.3,
  37: 52.1,
  38: 410,
  39: 820,
  40: 2_300,
};
const priceOf = (typeId: number) => PRICES[typeId] ?? 400;

function aggregates(typeIds: number[]) {
  return Object.fromEntries(
    typeIds
      .filter((typeId) => Number.isFinite(typeId) && typeId > 0)
      .map((typeId) => [
        typeId,
        {
          sell: { min: priceOf(typeId), volume: 5_000_000, orderCount: 40 },
          buy: { max: priceOf(typeId) * 0.92, volume: 2_000_000, orderCount: 30 },
        },
      ])
  );
}

/** Industry V, Advanced Industry V, 10 / 10 / 10 slots and every skill the tree asks for. */
const SKILLS: Record<number, number> = {
  3380: 5,
  3388: 5,
  45746: 5,
  3387: 5,
  24625: 5,
  3406: 5,
  24624: 5,
  45748: 5,
  45749: 5,
  3395: 4,
  11441: 4,
  11443: 4,
  11445: 4,
  11451: 4,
  11452: 4,
  11529: 4,
  16622: 4,
  3446: 4,
};

function routes(): FixtureRoute[] {
  const own = String.raw`^/characters/\d+`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  const skills = Object.entries(SKILLS).map(([id, level]) => ({
    skill_id: Number(id),
    trained_skill_level: level,
    active_skill_level: level,
    skillpoints_in_skill: 256_000 * level,
  }));
  return [
    {
      path: '/aggregates/',
      respond: ({ url }) => ({
        body: aggregates((url.searchParams.get('types') ?? '').split(',').map(Number)),
      }),
    },
    {
      path: at('/skills'),
      respond: () => ({
        body: { skills, total_sp: skills.reduce((sum, s) => sum + s.skillpoints_in_skill, 0) },
      }),
    },
    ...haulingFixtureRoutes(),
    {
      path: /^\/characters\/\d+$/,
      respond: () => ({
        body: {
          name: SAMPLE_ACTIVE_CHARACTER.name,
          corporation_id: SAMPLE_ACTIVE_CHARACTER.corporationId,
          birthday: '2019-04-02T00:00:00Z',
          bloodline_id: 1,
          gender: 'female',
          race_id: 2,
          security_status: 1.2,
        },
      }),
    },
    {
      path: /^\/corporations\/\d+$/,
      respond: () => ({
        body: {
          name: SAMPLE_ACTIVE_CHARACTER.corporationName,
          ticker: 'BRASS',
          ceo_id: SAMPLE_ACTIVE_CHARACTER.characterId,
          creator_id: SAMPLE_ACTIVE_CHARACTER.characterId,
          member_count: 12,
          tax_rate: 0.1,
        },
      }),
    },
    {
      path: at('/blueprints'),
      respond: () => ({
        body: [
          {
            item_id: 1_040_000_201,
            type_id: JAGUAR_BLUEPRINT,
            location_id: 60003760,
            location_flag: 'Hangar',
            quantity: -2,
            runs: 10,
            material_efficiency: 2,
            time_efficiency: 4,
          },
          ...[...REACTION_FORMULAS, ...PART_BLUEPRINTS].map((typeId, i) => ({
            item_id: 1_040_000_210 + i,
            type_id: typeId,
            location_id: 60003760,
            location_flag: 'Hangar',
            quantity: -1,
            runs: -1,
            material_efficiency: PART_BLUEPRINTS.includes(typeId) ? 10 : 0,
            time_efficiency: PART_BLUEPRINTS.includes(typeId) ? 20 : 0,
          })),
        ],
        headers: { 'X-Pages': '1' },
      }),
    },
    { path: at('/industry/jobs'), respond: () => ({ body: [] }) },
    { path: at('/assets'), respond: () => ({ body: [], headers: { 'X-Pages': '1' } }) },
    { path: /^\/loyalty\/stores\/\d+\/offers\/$/, respond: () => ({ body: [] }) },
    {
      path: '/contract-offers/index.json',
      respond: () => ({ body: { lastSyncedAt: Date.now(), types: {}, regionIds: [] } }),
    },
    {
      path: '/markets/prices',
      respond: () => ({
        body: Object.entries(PRICES).map(([typeId, price]) => ({
          type_id: Number(typeId),
          adjusted_price: price * 0.9,
          average_price: price * 0.95,
        })),
      }),
    },
    {
      path: '/industry/systems',
      respond: () => ({
        body: [
          {
            solar_system_id: 30000142,
            cost_indices: [{ activity: 'manufacturing', cost_index: 0.0412 }],
          },
          { solar_system_id: TAMA, cost_indices: [{ activity: 'reaction', cost_index: 0.0123 }] },
        ],
      }),
    },
  ];
}

const SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_loyalty.v1',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-clones.read_implants.v1',
  'esi-characters.read_standings.v1',
  'esi-characters.read_blueprints.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-assets.read_assets.v1',
];

async function seed() {
  const plan: BuildPlanRecord = {
    id: PLAN_ID,
    characterId: SAMPLE_ACTIVE_CHARACTER.characterId,
    name: 'Jaguar',
    blueprintTypeID: JAGUAR_BLUEPRINT,
    runs: 1,
    me: 2,
    te: 4,
    facility: 'npcStation',
    security: 'highsec',
    hubId: 'jita',
    buildHere: [...PARTS, ...REACTIONS],
    includeReactions: true,
    reactionFacility: 'athanor',
    reactionSecurity: 'lowsec',
    reactionBuildSystemId: TAMA,
    reactionBuildSystemName: 'Tama',
    updatedAt: Date.now(),
  };
  await db.buildPlans.clear();
  await db.buildPlans.put(plan);
}

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** Wave lengths: slowest reaction, slowest part, then the Jaguar's own job (the plan's Time). */
const WAVES = {
  reactions: 9 * HOUR + 40 * MINUTE,
  parts: 3 * HOUR + 20 * MINUTE,
  final: 19 * HOUR + 15 * MINUTE,
};
/** EVE time, "Thu 14:20". */
function eveDay(ms: number): string {
  const date = new Date(ms);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day} ${time}`;
}

function PlanScheduleLine({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(expanded);
  // Offsets from now: the longest reaction, then the longest part, then the Jaguar's own job.
  const [now] = useState(() => Date.now());
  const partsAt = now + WAVES.reactions;
  const finalAt = partsAt + WAVES.parts;
  const doneAt = finalAt + WAVES.final;
  return (
    <NewComponent name="PlanScheduleLine">
      <div className="text-xs tabular-nums text-text-dim">
        <p>
          Uses 6 slots · done by {eveDay(doneAt)} ·{' '}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-xs text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Caret expanded={open} />
            {open ? 'Hide plan' : 'Show plan'}
          </button>
        </p>
        {open && (
          <>
            <p>
              Now: 4 reactions · {eveDay(partsAt)}: 6 parts · {eveDay(finalAt)}: final item
            </p>
            <p className="text-text-faint">Sub-jobs are timed at TE 0</p>
          </>
        )}
      </div>
    </NewComponent>
  );
}

/** Swaps today's slot line ("…: uses 1 Mfg slot · … if started now") for the proposal. */
function InPlaceOfSlotLine({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    let hidden: HTMLElement | null = null;
    const find = () => {
      if (made) return;
      const line = [...document.querySelectorAll<HTMLElement>('p')].find((p) =>
        /: uses 1 .* slot · /.test(p.textContent ?? '')
      );
      if (!line) return;
      hidden = line;
      line.style.display = 'none';
      made = document.createElement('div');
      line.after(made);
      setHost(made);
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    find();
    return () => {
      observer.disconnect();
      made?.remove();
      if (hidden) hidden.style.display = '';
    };
  }, []);
  return host ? createPortal(children, host) : null;
}

/** Under Vitest the plan page's SDE reads are relative URLs node can't fetch, so the smoke test renders the proposal alone. */
const isTest = import.meta.env.MODE === 'test';

const page = (
  <Routes>
    <Route path="/industry/plans/:planId" element={<IndustryPlanPage />} />
  </Routes>
);
const phone = { viewport: { value: 'mobile1', isRotated: false } };

function proposal(expanded: boolean) {
  return isTest ? (
    <PlanScheduleLine expanded={expanded} />
  ) : (
    <>
      {page}
      <InPlaceOfSlotLine>
        <PlanScheduleLine expanded={expanded} />
      </InPlaceOfSlotLine>
    </>
  );
}

const meta = {
  title: 'mockups/PlanSlotSchedule',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: { path: `/industry/plans/${PLAN_ID}`, routes, scopes: SCOPES, seed },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: a Jaguar plan with six parts and four reactions; the slot line counts only the top job. */
export const Today: Story = { render: () => (isTest ? <p>Jaguar plan</p> : page) };

/** @summary Today's plan hero on a phone. */
export const TodayPhone: Story = { ...Today, globals: phone };

/** @summary The slot line schedules the whole tree: "Uses 6 slots · done by Thu 14:20 · Show plan". New component: PlanScheduleLine. */
export const Proposed: Story = { render: () => proposal(false) };

/** @summary "Show plan" open in the line: the three waves and "Sub-jobs are timed at TE 0". */
export const Expanded: Story = { render: () => proposal(true) };

/** @summary The collapsed line in the phone shell. */
export const ProposedPhone: Story = { ...Proposed, globals: phone };

/** @summary The expanded line in the phone shell. */
export const ExpandedPhone: Story = { ...Expanded, globals: phone };

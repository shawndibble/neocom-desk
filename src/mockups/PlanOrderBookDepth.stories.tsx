import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Route, Routes } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { db, type BuildPlanRecord } from '@/db';
import { Section } from '@/features/industry/CalculationBreakdown';
import { IndustryPlanPage } from '@/routes/IndustryPlanPage';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { haulingFixtureRoutes } from '@/storybook/haulingFixtures';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T5): order-book depth pricing for a Build Plan's materials. A
 * material row whose need is at least 1% of the hub's listed sell units walks
 * the hub's ESI sell book; its Price cell gains a second line, "4.12 best ·
 * 4.31 avg for 2M", and the plan's cost uses the average. Small rows stay on
 * top-of-book with no second line. The Calculation Breakdown lists the book
 * levels each walked row used.
 *
 * New components in this mockup: `DepthLine` (the Price cell's second
 * line, in a Price column widened to fit it; the first one is labelled, the
 * others carry only the dashed outline)
 * and `OrderBookDepthSection` (the breakdown's levels list, built from the
 * breakdown's own `Section`). Everything else is the real plan
 * page.
 */

const PLAN_ID = 'mock-depth-plan';
/** Rifter Blueprint. */
const RIFTER_BLUEPRINT = 691;
const RIFTER = 587;

/** Jita sell side per material: what the walk found, and the listed units Fuzzwork reports. */
interface Depth {
  name: string;
  best: number;
  /** The average for the plan's need; the Price input shows it, because the cost uses it. */
  avg: number;
  need: string;
  listed: number;
  levels: { price: number; units: string }[];
}

/** 70 runs at ME 10: Tritanium 2,016,000, Pyerite 378,000, Isogen 31,500 clear 1% of listed; Mexallon does not. */
const DEPTH: Record<number, Depth> = {
  34: {
    name: 'Tritanium',
    best: 4.12,
    avg: 4.31,
    need: '2M',
    listed: 120_000_000,
    levels: [
      { price: 4.12, units: '610,000' },
      { price: 4.25, units: '540,000' },
      { price: 4.39, units: '480,000' },
      { price: 4.58, units: '386,000 (of 1,200,000 listed)' },
    ],
  },
  35: {
    name: 'Pyerite',
    best: 9.8,
    avg: 10.05,
    need: '378k',
    listed: 30_000_000,
    levels: [
      { price: 9.8, units: '190,000' },
      { price: 10.2, units: '120,000' },
      { price: 10.5, units: '68,000 (of 240,000 listed)' },
    ],
  },
  37: {
    name: 'Isogen',
    best: 52.1,
    avg: 55.45,
    need: '31.5k',
    listed: 2_100_000,
    levels: [
      { price: 52.1, units: '12,000' },
      { price: 55.0, units: '9,500' },
      { price: 59.9, units: '10,000 (of 44,000 listed)' },
    ],
  },
};

/** Top-of-book rows: the need is under 1% of listed units, so no walk. */
const TOP_OF_BOOK: Record<number, { sell: number; buy: number; listed: number }> = {
  36: { sell: 48.3, buy: 46.9, listed: 40_000_000 },
  [RIFTER]: { sell: 420_000, buy: 381_000, listed: 310 },
};

function aggregates(typeIds: number[]) {
  return Object.fromEntries(
    typeIds.flatMap((typeId) => {
      const depth = DEPTH[typeId];
      const top = TOP_OF_BOOK[typeId];
      if (!depth && !top) return [];
      const sell = depth?.avg ?? top!.sell;
      const listed = depth?.listed ?? top!.listed;
      return [
        [
          typeId,
          {
            sell: { min: sell, volume: listed, orderCount: 40 },
            buy: { max: (depth?.best ?? top!.buy) * 0.96, volume: listed / 2, orderCount: 30 },
          },
        ],
      ];
    })
  );
}

const ADJUSTED: Record<number, number> = { 34: 4.0, 35: 9.6, 36: 47, 37: 51, [RIFTER]: 395_000 };

function routes(): FixtureRoute[] {
  const own = String.raw`^/characters/\d+`;
  const at = (tail: string) => new RegExp(`${own}${tail}$`);
  return [
    {
      path: '/aggregates/',
      respond: ({ url }) => ({
        body: aggregates((url.searchParams.get('types') ?? '').split(',').map(Number)),
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
      path: at('/blueprints'),
      respond: () => ({
        body: [
          {
            item_id: 1_040_000_001,
            type_id: RIFTER_BLUEPRINT,
            location_id: 60003760,
            location_flag: 'Hangar',
            quantity: -1,
            runs: -1,
            material_efficiency: 10,
            time_efficiency: 20,
          },
        ],
        headers: { 'X-Pages': '1' },
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
        body: Object.entries(ADJUSTED).map(([type_id, price]) => ({
          type_id: Number(type_id),
          adjusted_price: price,
          average_price: price,
        })),
      }),
    },
    {
      path: '/industry/systems',
      respond: () => ({
        body: [
          {
            solar_system_id: 30000142,
            cost_indices: [
              { activity: 'manufacturing', cost_index: 0.0412 },
              { activity: 'reaction', cost_index: 0.0123 },
            ],
          },
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
    name: 'Rifter',
    blueprintTypeID: RIFTER_BLUEPRINT,
    runs: 70,
    me: 10,
    te: 20,
    facility: 'npcStation',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: Date.now(),
  };
  await db.buildPlans.clear();
  await db.buildPlans.put(plan);
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DepthLine({ depth }: { depth: Depth }) {
  return (
    <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
      {fmt(depth.best)} best · {fmt(depth.avg)} avg for {depth.need}
    </span>
  );
}

/** Puts a second line into each walked row's Price cell, under the input, once the table renders. */
function IntoPriceCells() {
  const [hosts, setHosts] = useState<{ host: HTMLElement; typeId: number }[]>([]);
  useEffect(() => {
    const made: HTMLElement[] = [];
    const find = () => {
      // The second line needs a wider Price column than today's w-28.
      for (const th of document.querySelectorAll<HTMLElement>(
        'table[aria-label^="Materials:"] th'
      )) {
        if (th.textContent?.trim().startsWith('Price') && th.style.width !== '11rem') {
          th.style.width = '11rem';
        }
      }
      const next: { host: HTMLElement; typeId: number }[] = [];
      for (const [typeId, depth] of Object.entries(DEPTH)) {
        // Desktop: the Price input's own cell. Phone card: the "@ 4.31 ISK" edit button's wrapper.
        const input = document.querySelector<HTMLInputElement>(
          `input[aria-label="Price for ${depth.name}"]`
        );
        const phoneButton = [...document.querySelectorAll('button .sr-only')].find(
          (label) => label.textContent === `Price for ${depth.name}: `
        )?.parentElement;
        const cell = input?.closest('span.flex') ?? phoneButton?.parentElement;
        if (!cell) continue;
        let host = cell.querySelector<HTMLElement>(':scope > [data-depth-line]');
        if (!host) {
          host = document.createElement('span');
          host.dataset.depthLine = '';
          if (!input) host.className = 'mt-0.5 block text-right';
          cell.appendChild(host);
          made.push(host);
        }
        next.push({ host, typeId: Number(typeId) });
      }
      setHosts((prev) =>
        prev.length === next.length && prev.every((p, i) => p.host === next[i].host) ? prev : next
      );
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    find();
    return () => {
      observer.disconnect();
      made.forEach((el) => el.remove());
    };
  }, []);
  return (
    <>
      {hosts.map(({ host, typeId }, index) =>
        createPortal(
          index === 0 ? (
            <NewComponent name="DepthLine">
              {/* Room for the label's second line in a narrow cell; the shipped line has none. */}
              <span className="block pt-3.5">
                <DepthLine depth={DEPTH[typeId]} />
              </span>
            </NewComponent>
          ) : (
            <span className="rounded-xs border border-dashed border-warning px-1">
              <DepthLine depth={DEPTH[typeId]} />
            </span>
          ),
          host
        )
      )}
    </>
  );
}

function OrderBookDepthSection() {
  return (
    <NewComponent name="OrderBookDepthSection">
      <Section title="Order book depth">
        <p>
          Tritanium, Pyerite and Isogen each need at least 1% of the units listed for sale in Jita,
          so their price walks Jita&apos;s sell orders, cheapest first, until the plan&apos;s need
          is filled. The rest use the lowest sell. The Rifter&apos;s own sale price is still the
          lowest sell.
        </p>
        {Object.values(DEPTH).map((depth) => (
          <div key={depth.name} className="space-y-1">
            <p className="font-semibold">
              {depth.name}: {depth.need} needed · {fmt(depth.avg)} avg
            </p>
            <ul className="rounded-xs border border-line bg-panel-2 px-2 py-1 font-mono text-[0.6875rem] text-text-dim tabular-nums">
              {depth.levels.map((level) => (
                <li key={level.price}>
                  {fmt(level.price)} ISK × {level.units}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>
    </NewComponent>
  );
}

/** Opens the breakdown and puts the depth section after its Materials section. */
function IntoBreakdown({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    let opened = false;
    const find = () => {
      if (made) return;
      const dialog = document.querySelector('dialog[open]');
      if (!dialog) {
        if (opened) return;
        const trigger = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Calculations?"]'
        );
        if (trigger) {
          opened = true;
          trigger.click();
        }
        return;
      }
      const heading = [...dialog.querySelectorAll('h3')].find((h) =>
        /^material cost$/i.test(h.textContent?.trim() ?? '')
      );
      const section = heading?.closest('section');
      if (!section?.parentElement) return;
      made = document.createElement('div');
      section.parentElement.insertBefore(made, section.nextSibling);
      setHost(made);
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    find();
    return () => {
      observer.disconnect();
      made?.remove();
    };
  }, []);
  return host ? createPortal(children, host) : null;
}

const page = (
  <Routes>
    <Route path="/industry/plans/:planId" element={<IndustryPlanPage />} />
  </Routes>
);

const meta = {
  title: 'mockups/PlanOrderBookDepth',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: { path: `/industry/plans/${PLAN_ID}`, routes, scopes: SCOPES, seed },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Under Vitest the plan page's SDE reads are relative URLs node can't fetch, so the smoke test renders the proposal alone. */
const isTest = import.meta.env.MODE === 'test';

/** @summary Today: a 70-run Rifter plan's Materials table, every row priced at the lowest Jita sell. */
export const Today: Story = { render: () => (isTest ? <p>Rifter plan</p> : page) };

/** @summary Price cells of the three big rows gain "4.12 best · 4.31 avg for 2M"; the cost uses the average. New component: DepthLine. */
export const Proposed: Story = {
  render: () =>
    isTest ? (
      <DepthLine depth={DEPTH[34]} />
    ) : (
      <>
        {page}
        <IntoPriceCells />
      </>
    ),
};

/** @summary The proposal in the phone shell: the second line sits under the price on each card. */
export const ProposedPhone: Story = {
  ...Proposed,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Calculation Breakdown with an "Order book depth" section listing the levels each walked row used. New component: OrderBookDepthSection. */
export const Breakdown: Story = {
  render: () =>
    isTest ? (
      <OrderBookDepthSection />
    ) : (
      <>
        {page}
        <IntoPriceCells />
        <IntoBreakdown>
          <OrderBookDepthSection />
        </IntoBreakdown>
      </>
    ),
};

/** @summary The breakdown section in the phone shell. */
export const BreakdownPhone: Story = {
  ...Breakdown,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

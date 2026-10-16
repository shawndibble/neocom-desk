import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Route, Routes } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { db, type BuildPlanRecord } from '@/db';
import { Industry } from '@/routes/Industry';
import { IndustryPlanPage } from '@/routes/IndustryPlanPage';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { haulingFixtureRoutes } from '@/storybook/haulingFixtures';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T7): the latest full day's region average against the median of
 * the last 90 days' daily averages, for the product. Ranked and Market-Wide
 * Build Opportunities gain a "vs 90d" column ("+35%", amber from +20%; blank
 * when the item traded on too few days). The plan page's qualifier line gains
 * an amber note when the product is 20% or more above its median: "Sell price
 * is 35% above its 90-day median".
 *
 * The table shown is Ranked Build Opportunities, the real panel fed by owned
 * blueprints. Market-Wide gets the same column but only fills after a
 * market-wide Scan, which the story fixtures cannot drive.
 *
 * New components in this mockup: `NinetyDayColumn` (the column: labelled
 * header, dashed cells) and `NinetyDayNote` (the amber note closing the
 * plan's qualifier line). Everything else is the real Industry pages.
 */

const PLAN_ID = 'mock-ninety-day-plan';

interface Product {
  name: string;
  blueprint: number;
  product: number;
  sell: number;
  /** Latest day vs 90-day median, percent; null = too few traded days. */
  vs90d: number | null;
}

const PRODUCTS: Product[] = [
  { name: 'Rifter', blueprint: 691, product: 587, sell: 420_000, vs90d: 35 },
  { name: 'Slasher', blueprint: 689, product: 585, sell: 372_000, vs90d: -6 },
  { name: 'Merlin', blueprint: 950, product: 603, sell: 395_000, vs90d: -3 },
  { name: 'Thrasher', blueprint: 16243, product: 16242, sell: 905_000, vs90d: -12 },
  { name: 'Catalyst', blueprint: 16241, product: 16240, sell: 860_000, vs90d: 22 },
  { name: 'Stabber', blueprint: 692, product: 622, sell: 9_100_000, vs90d: 4 },
  { name: 'Venture', blueprint: 32881, product: 32880, sell: 290_000, vs90d: 1 },
  { name: 'Hobgoblin I', blueprint: 2455, product: 2454, sell: 4_850, vs90d: null },
  { name: 'Warrior I', blueprint: 2487, product: 2486, sell: 7_900, vs90d: 8 },
  { name: 'Hammerhead I', blueprint: 2184, product: 2183, sell: 41_000, vs90d: -1 },
  { name: '200mm AutoCannon I', blueprint: 821, product: 486, sell: 19_400, vs90d: null },
  { name: 'Damage Control I', blueprint: 2047, product: 2046, sell: 9_900, vs90d: -9 },
];

/** Jita lowest sell and listed units for the minerals these blueprints use. */
const MINERALS: Record<number, { sell: number; listed: number }> = {
  34: { sell: 4.12, listed: 120_000_000 },
  35: { sell: 9.8, listed: 30_000_000 },
  36: { sell: 48.3, listed: 40_000_000 },
  37: { sell: 52.1, listed: 2_100_000 },
  38: { sell: 410, listed: 900_000 },
  39: { sell: 820, listed: 400_000 },
  40: { sell: 2_300, listed: 160_000 },
};

function priceOf(typeId: number): { sell: number; listed: number } | null {
  const mineral = MINERALS[typeId];
  if (mineral) return mineral;
  const product = PRODUCTS.find((p) => p.product === typeId);
  return product ? { sell: product.sell, listed: 400 } : null;
}

function aggregates(typeIds: number[]) {
  return Object.fromEntries(
    typeIds.flatMap((typeId) => {
      const price = priceOf(typeId);
      if (!price) return [];
      return [
        [
          typeId,
          {
            sell: { min: price.sell, volume: price.listed, orderCount: 40 },
            buy: { max: price.sell * 0.92, volume: price.listed / 2, orderCount: 30 },
          },
        ],
      ];
    })
  );
}

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
        body: PRODUCTS.map((p, i) => ({
          item_id: 1_040_000_100 + i,
          type_id: p.blueprint,
          location_id: 60003760,
          location_flag: 'Hangar',
          quantity: -1,
          runs: -1,
          material_efficiency: 10,
          time_efficiency: 20,
        })),
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
        body: [
          ...Object.entries(MINERALS).map(([typeId, m]) => ({
            type_id: Number(typeId),
            adjusted_price: m.sell * 0.97,
            average_price: m.sell * 0.97,
          })),
          ...PRODUCTS.map((p) => ({
            type_id: p.product,
            adjusted_price: p.sell * 0.9,
            average_price: p.sell * 0.95,
          })),
        ],
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
    blueprintTypeID: 691,
    runs: 10,
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

function formatVs90d(value: number | null): string {
  if (value === null) return '';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`;
}

/** Amber from +20%: the price is unusually high, so the plan's revenue may not last. */
function Vs90dValue({ value }: { value: number | null }) {
  return (
    <span className={value !== null && value >= 20 ? 'text-warning' : undefined}>
      {formatVs90d(value)}
    </span>
  );
}

/**
 * Adds a "vs 90d" column after Margin in the Build Opportunities table, and
 * a "vs 90d" readout after Margin on each phone card, once they render.
 */
function IntoOpportunities() {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const made: HTMLElement[] = [];
    const find = () => {
      // Phone cards: a "vs 90d" readout after "Margin: …"; a blank value adds nothing.
      for (const margin of document.querySelectorAll('span')) {
        if (!margin.textContent?.startsWith('Margin: ') || margin.closest('table')) continue;
        if (margin.nextElementSibling?.hasAttribute('data-vs90d')) continue;
        const card = margin.parentElement?.parentElement;
        const name = card?.querySelector('button')?.textContent?.trim();
        const product = PRODUCTS.find((p) => p.name === name);
        if (!product || product.vs90d === null) continue;
        const readout = document.createElement('span');
        readout.dataset.vs90d = '';
        readout.className = 'rounded-xs border border-dashed border-warning/60 px-1';
        readout.textContent = `vs 90d: ${formatVs90d(product.vs90d)}`;
        if (product.vs90d >= 20) readout.classList.add('text-warning');
        margin.after(readout);
        made.push(readout);
      }
      const table = document.querySelector('table[aria-label="Build Opportunities"]');
      if (!table) return;
      const headRow = table.querySelector('thead tr');
      const marginIndex = [...(headRow?.children ?? [])].findIndex((cell) =>
        /^margin/i.test(cell.textContent?.trim() ?? '')
      );
      if (!headRow || marginIndex < 0) return;
      if (!headRow.querySelector('[data-vs90d]')) {
        const th = document.createElement('th');
        th.dataset.vs90d = '';
        th.scope = 'col';
        th.className = 'px-2 py-1 text-right align-bottom';
        headRow.children[marginIndex].after(th);
        made.push(th);
        setHeader(th);
      }
      for (const row of table.querySelectorAll('tbody tr')) {
        if (row.querySelector('[data-vs90d]')) continue;
        const product = PRODUCTS.find((p) => row.textContent?.includes(p.name));
        if (!product || !row.children[marginIndex]) continue;
        const td = document.createElement('td');
        td.dataset.vs90d = '';
        td.className =
          'border-x border-dashed border-warning/60 px-2 text-right text-sm tabular-nums';
        td.textContent = formatVs90d(product.vs90d);
        if (product.vs90d !== null && product.vs90d >= 20) td.classList.add('text-warning');
        row.children[marginIndex].after(td);
        made.push(td);
      }
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    find();
    return () => {
      observer.disconnect();
      made.forEach((el) => el.remove());
    };
  }, []);
  return header
    ? createPortal(
        <NewComponent name="NinetyDayColumn">
          {/* Room for the label's second line; the shipped header is one line. */}
          <span className="block min-w-[8rem] pt-3.5 text-xs font-semibold tracking-wide uppercase">
            vs 90d
          </span>
        </NewComponent>,
        header
      )
    : null;
}

function NinetyDayNote() {
  return (
    <span className="mt-1 block w-fit">
      <NewComponent name="NinetyDayNote">
        <span className="text-xs text-warning">Sell price is 35% above its 90-day median</span>
      </NewComponent>
    </span>
  );
}

/** Closes the plan hero's qualifier line ("13.3% margin · … · break-even …") with the note. */
function IntoQualifierLine({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    const find = () => {
      if (made) return;
      const line = [...document.querySelectorAll('p')].find((p) =>
        /margin · .*break-even/.test(p.textContent ?? '')
      );
      if (!line) return;
      made = document.createElement('span');
      line.appendChild(made);
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

/** Under Vitest the Industry pages' SDE reads are relative URLs node can't fetch, so the smoke test renders the proposal alone. */
const isTest = import.meta.env.MODE === 'test';

const opportunitiesPage = (
  <Routes>
    <Route path="/industry/*" element={<Industry />} />
  </Routes>
);
const planPage = (
  <Routes>
    <Route path="/industry/plans/:planId" element={<IndustryPlanPage />} />
  </Routes>
);
const opportunitiesShell = {
  layout: 'fullscreen',
  shell: { path: '/industry/opportunities', routes, scopes: SCOPES, seed },
};
const planShell = {
  layout: 'fullscreen',
  shell: { path: `/industry/plans/${PLAN_ID}`, routes, scopes: SCOPES, seed },
};
const phone = { viewport: { value: 'mobile1', isRotated: false } };

const meta = {
  title: 'mockups/PriceVsNinetyDay',
  tags: ['!manifest'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today: Ranked Build Opportunities for twelve owned blueprints, no price-history column. */
export const TodayTable: Story = {
  parameters: opportunitiesShell,
  render: () => (isTest ? <p>Build Opportunities</p> : opportunitiesPage),
};

/** @summary Today's Build Opportunities on a phone. */
export const TodayTablePhone: Story = { ...TodayTable, globals: phone };

/** @summary Build Opportunities with a "vs 90d" column after Margin: "+35%" amber, "−12%", blank. New component: NinetyDayColumn. */
export const Table: Story = {
  parameters: opportunitiesShell,
  render: () =>
    isTest ? (
      <Vs90dValue value={35} />
    ) : (
      <>
        {opportunitiesPage}
        <IntoOpportunities />
      </>
    ),
};

/** @summary The "vs 90d" column on the phone's opportunity cards. */
export const TablePhone: Story = { ...Table, globals: phone };

/** @summary Today: a Rifter plan's qualifier line, margin to break-even, no price-history note. */
export const TodayPlan: Story = {
  parameters: planShell,
  render: () => (isTest ? <p>Rifter plan</p> : planPage),
};

/** @summary Today's plan hero on a phone. */
export const TodayPlanPhone: Story = { ...TodayPlan, globals: phone };

/** @summary The plan's qualifier line ends with the amber "Sell price is 35% above its 90-day median". New component: NinetyDayNote. */
export const PlanNote: Story = {
  parameters: planShell,
  render: () =>
    isTest ? (
      <NinetyDayNote />
    ) : (
      <>
        {planPage}
        <IntoQualifierLine>
          <NinetyDayNote />
        </IntoQualifierLine>
      </>
    ),
};

/** @summary The note on the phone plan hero. */
export const PlanNotePhone: Story = { ...PlanNote, globals: phone };

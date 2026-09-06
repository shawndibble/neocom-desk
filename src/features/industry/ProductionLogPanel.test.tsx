import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db, type BuildPlanRecord } from '@/db';
import type { WalletTransaction } from '@/esi/endpoints';
import type { BlueprintCatalog } from './blueprintCatalog';
import { ProductionLogPanel } from './ProductionLogPanel';

const loadWalletTransactions = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/wallet', () => ({ loadWalletTransactions }));

const loadOrders = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/orders', () => ({ loadOrders }));

const CHARACTER_ID = 1;
const RIFTER_TYPE_ID = 587;
const RAVEN_TYPE_ID = 638;

function catalogWith(entries: { productTypeID: number; productName: string }[]): BlueprintCatalog {
  const byProductTypeID = new Map(
    entries.map((e) => [
      e.productTypeID,
      {
        blueprintTypeID: e.productTypeID + 1000,
        blueprint: {} as never,
        productTypeID: e.productTypeID,
        productName: e.productName,
        productNameLower: e.productName.toLowerCase(),
      },
    ])
  );
  return { entries: [], byBlueprintTypeID: new Map(), byProductTypeID, typesById: {} };
}

const CATALOG = catalogWith([
  { productTypeID: RIFTER_TYPE_ID, productName: 'Rifter' },
  { productTypeID: RAVEN_TYPE_ID, productName: 'Raven' },
]);

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'plan-1',
    characterId: CHARACTER_ID,
    name: 'Rifter Line',
    blueprintTypeID: RIFTER_TYPE_ID + 1000,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: Date.now(),
    ...overrides,
  };
}

const PLANS: BuildPlanRecord[] = [
  plan({ id: 'plan-1', name: 'Rifter Line' }),
  plan({ id: 'plan-2', name: 'Rifter Line 2' }),
  plan({ id: 'plan-3', name: 'Raven Line' }),
];

function txn(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 9001,
    date: '2026-09-01T00:00:00Z',
    location_id: 60003760,
    type_id: RIFTER_TYPE_ID,
    unit_price: 100_000,
    quantity: 5,
    client_id: 1,
    is_buy: false,
    is_personal: true,
    journal_ref_id: 1,
    ...overrides,
  };
}

async function addRun(overrides: Partial<Parameters<typeof db.productionRuns.add>[0]> = {}) {
  const now = Date.now();
  await db.productionRuns.add({
    id: crypto.randomUUID(),
    characterId: CHARACTER_ID,
    buildPlanId: 'plan-1',
    productTypeID: RIFTER_TYPE_ID,
    quantity: 10,
    materialCost: 500_000,
    jobFee: 50_000,
    totalCost: 550_000,
    loggedAt: now,
    updatedAt: now,
    ...overrides,
  });
}

/**
 * Unfolds "All production runs" if still folded, then returns the table.
 * Idempotent across repeat calls in one test: once expanded the caret reads
 * "Hide…", so a later call is a no-op rather than re-folding it.
 */
async function runsTable() {
  const toggle = await screen.findByRole('button', { name: /all production runs/i });
  if (toggle.getAttribute('aria-label')?.startsWith('Show')) {
    await userEvent.click(toggle);
  }
  return screen.findByRole('table', { name: 'All production runs' });
}

beforeEach(async () => {
  await db.productionRuns.clear();
  await db.productionSaleLinks.clear();
  await db.productionOrderWatches.clear();
  loadWalletTransactions.mockReset().mockResolvedValue(null);
  loadOrders.mockReset().mockResolvedValue({ cached: null, needsReauth: false });
});

describe('ProductionLogPanel', () => {
  it('shows the empty state with no runs logged anywhere', () => {
    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );
    expect(screen.getByText('No production runs logged anywhere yet')).toBeInTheDocument();
  });

  it('rolls up totals across every run, for every Build Plan', async () => {
    await addRun({ id: 'run-1', materialCost: 500_000, jobFee: 50_000, totalCost: 550_000 });
    await addRun({
      id: 'run-2',
      buildPlanId: 'plan-2',
      materialCost: 200_000,
      jobFee: 20_000,
      totalCost: 220_000,
    });
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${CHARACTER_ID}:txn:1`,
      characterId: CHARACTER_ID,
      runId: 'run-1',
      transactionId: 1,
      quantity: 10,
      unitPrice: 100_000,
      linkedAt: now,
      updatedAt: now,
    });

    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );

    // Total cost logged across both runs.
    expect(await screen.findByText(/770,000|770000/)).toBeInTheDocument();
  });

  it('groups the "By item" table by product, not by run', async () => {
    await addRun({ id: 'run-1', productTypeID: RIFTER_TYPE_ID });
    await addRun({ id: 'run-2', productTypeID: RIFTER_TYPE_ID, buildPlanId: 'plan-2' });
    await addRun({ id: 'run-3', productTypeID: RAVEN_TYPE_ID, buildPlanId: 'plan-3', quantity: 1 });

    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );

    const byItemTable = await screen.findByRole('table', { name: 'By item' });
    const rifterRow = within(byItemTable).getByText('Rifter').closest('tr');
    expect(rifterRow).not.toBeNull();
    // Two runs of 10 units each rolled into one Rifter row.
    expect(rifterRow?.textContent).toContain('2'); // runs logged
    expect(rifterRow?.textContent).toContain('20'); // units produced

    expect(within(byItemTable).getByText('Raven')).toBeInTheDocument();
  });

  it('falls back to a typeID label when the catalog has no entry for it', async () => {
    await addRun({ productTypeID: 999999 });
    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );
    const byItemTable = await screen.findByRole('table', { name: 'By item' });
    expect(within(byItemTable).getByText('#999999')).toBeInTheDocument();
  });

  it('lists every run in the runs table without naming which Build Plan it came from', async () => {
    await addRun({ id: 'run-1', buildPlanId: 'plan-1' });
    await addRun({ id: 'run-2', buildPlanId: 'plan-3', productTypeID: RAVEN_TYPE_ID });

    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );

    const table = await runsTable();
    // Header + 2 data rows.
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Rifter')).toBeInTheDocument();
    expect(within(table).getByText('Raven')).toBeInTheDocument();
    expect(within(table).queryByText('Rifter Line')).not.toBeInTheDocument();
    expect(within(table).queryByText('Raven Line')).not.toBeInTheDocument();
  });

  it('excludes runs outside the selected date range, keeping runs inside it', async () => {
    const old = Date.parse('2026-01-01T00:00:00Z');
    const recent = Date.parse('2026-08-15T00:00:00Z');
    await addRun({ id: 'run-old', loggedAt: old, updatedAt: old, quantity: 7 });
    await addRun({ id: 'run-recent', loggedAt: recent, updatedAt: recent, quantity: 42 });

    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );
    // Both present before filtering.
    const table = await runsTable();
    expect(within(table).getByText('7')).toBeInTheDocument();
    expect(within(table).getByText('42')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '2026-08-01');

    expect(within(await runsTable()).queryByText('7')).not.toBeInTheDocument();
    expect(within(await runsTable()).getByText('42')).toBeInTheDocument();
  });

  it('reports a filtered-empty state distinct from the "nothing logged ever" state', async () => {
    const old = Date.parse('2026-01-01T00:00:00Z');
    await addRun({ id: 'run-old', loggedAt: old, updatedAt: old });

    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('From'), '2026-08-01');

    expect(screen.getByText('No production runs in this period')).toBeInTheDocument();
  });

  it("hands the clicked run's Build Plan id to onOpenRun", async () => {
    await addRun({ id: 'run-1', buildPlanId: 'plan-2' });
    const onOpenRun = vi.fn();

    render(
      <ProductionLogPanel
        characterId={CHARACTER_ID}
        catalog={CATALOG}
        skills={{}}
        plans={PLANS}
        onOpenRun={onOpenRun}
      />
    );

    const table = await runsTable();
    const row = within(table).getAllByRole('row')[1];
    await userEvent.click(row);
    expect(onOpenRun).toHaveBeenCalledWith('plan-2');
  });

  it("does not navigate when the run's own Build Plan no longer exists — a locked record with nowhere left to jump to", async () => {
    await addRun({ id: 'run-1', buildPlanId: 'plan-deleted' });
    const onOpenRun = vi.fn();

    render(
      <ProductionLogPanel
        characterId={CHARACTER_ID}
        catalog={CATALOG}
        skills={{}}
        plans={PLANS}
        onOpenRun={onOpenRun}
      />
    );

    const table = await runsTable();
    const row = within(table).getAllByRole('row')[1];
    await userEvent.click(row);
    expect(onOpenRun).not.toHaveBeenCalled();
  });

  it("links a past sale directly from the runs table's Sold button", async () => {
    await addRun({ id: 'run-1' });
    loadWalletTransactions.mockResolvedValue({
      data: [txn()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    const user = userEvent.setup();
    render(
      <ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} plans={PLANS} />
    );
    await runsTable();

    await user.click(await screen.findByRole('button', { name: 'Sold' }));
    await waitFor(() => screen.getByRole('button', { name: 'Link' }));
    await user.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(async () => {
      expect(await db.productionSaleLinks.count()).toBe(1);
    });
    const link = (await db.productionSaleLinks.toArray())[0];
    expect(link).toMatchObject({ runId: 'run-1', transactionId: 9001, quantity: 5 });
  });
});

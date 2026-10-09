import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { WalletTransaction } from '@/esi/endpoints';
import type { MarketOrder } from '@/esi/endpoints';
import { ProductionRunsPanel } from './ProductionRunsPanel';

const loadWalletTransactions = vi.hoisted(() => vi.fn());
const hasWalletScope = vi.hoisted(() => vi.fn());
const loadWalletJournal = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/wallet', () => ({
  loadWalletTransactions,
  hasWalletScope,
  loadWalletJournal,
}));

const loadOrders = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/orders', () => ({ loadOrders }));

const scheduleSync = vi.hoisted(() => vi.fn());
vi.mock('@/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sync')>()),
  scheduleSync,
}));

const CHARACTER_ID = 1;
const BUILD_PLAN_ID = 'plan-1';
const PRODUCT_TYPE_ID = 587;

function txn(overrides: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    transaction_id: 9001,
    date: '2026-09-01T00:00:00Z',
    location_id: 60003760,
    type_id: PRODUCT_TYPE_ID,
    unit_price: 100_000,
    quantity: 5,
    client_id: 1,
    is_buy: false,
    is_personal: true,
    journal_ref_id: 1,
    ...overrides,
  };
}

function order(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 8001,
    type_id: PRODUCT_TYPE_ID,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    price: 95_000,
    volume_remain: 10,
    volume_total: 10,
    issued: '2026-09-01T00:00:00Z',
    duration: 90,
    range: 'station',
    ...overrides,
  };
}

async function addRun(overrides: Partial<Parameters<typeof db.productionRuns.add>[0]> = {}) {
  const now = Date.now();
  await db.productionRuns.add({
    id: 'run-1',
    characterId: CHARACTER_ID,
    buildPlanId: BUILD_PLAN_ID,
    productTypeID: PRODUCT_TYPE_ID,
    quantity: 5,
    materialCost: 300_000,
    jobFee: 20_000,
    totalCost: 320_000,
    loggedAt: now,
    updatedAt: now,
    ...overrides,
  });
}

beforeEach(async () => {
  await db.productionRuns.clear();
  await db.productionSaleLinks.clear();
  await db.productionOrderWatches.clear();
  await db.productionLosses.clear();
  hasWalletScope.mockReset().mockResolvedValue(false);
  loadWalletJournal.mockReset().mockResolvedValue(null);
  loadWalletTransactions.mockReset().mockResolvedValue(null);
  loadOrders.mockReset().mockResolvedValue({ cached: null, needsReauth: false });
  scheduleSync.mockReset();
});

function renderPanel(
  defaults: { quantity: number; materialCost: number; jobFee: number; sourceJobId?: number } | null
) {
  return render(
    <ProductionRunsPanel
      characterId={CHARACTER_ID}
      buildPlanId={BUILD_PLAN_ID}
      defaults={defaults}
      productTypeID={PRODUCT_TYPE_ID}
      productName="Rifter"
      skills={{}}
    />
  );
}

/** Opens the row's "Sold" split button's dropdown and clicks one of its extra items. */
async function chooseSoldMenuItem(user: ReturnType<typeof userEvent.setup>, itemName: string) {
  await user.click(screen.getByRole('button', { name: 'More sale options' }));
  await user.click(await screen.findByRole('menuitem', { name: itemName }));
}

/** Unfolds the runs table, once its caret has arrived (rows load via useLiveQuery). */
async function expandRuns(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Show production runs' }));
}

describe('ProductionRunsPanel', () => {
  it('shows the empty state with no logged runs', () => {
    renderPanel(null);
    expect(screen.getByText('No production runs logged yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use Log production above to track realized profit and link the sales and orders that sold it.'
      )
    ).toBeInTheDocument();
  });

  it('logs a Production Run from the plan defaults', async () => {
    const user = userEvent.setup();
    renderPanel({ quantity: 10, materialCost: 500_000, jobFee: 50_000 });

    await user.click(screen.getByRole('button', { name: 'Log Production' }));
    await user.click(screen.getByRole('button', { name: 'Save run' }));

    await waitFor(async () => {
      expect(await db.productionRuns.where('buildPlanId').equals(BUILD_PLAN_ID).count()).toBe(1);
    });
    const run = (await db.productionRuns.where('buildPlanId').equals(BUILD_PLAN_ID).toArray())[0];
    expect(run).toMatchObject({
      characterId: CHARACTER_ID,
      buildPlanId: BUILD_PLAN_ID,
      productTypeID: PRODUCT_TYPE_ID,
      quantity: 10,
      materialCost: 500_000,
      jobFee: 50_000,
      totalCost: 550_000,
    });
  });

  it('stores the job it was logged from as sourceJobId', async () => {
    const user = userEvent.setup();
    renderPanel({ quantity: 10, materialCost: 500_000, jobFee: 50_000, sourceJobId: 4242 });

    await user.click(screen.getByRole('button', { name: 'Log Production' }));
    await user.click(screen.getByRole('button', { name: 'Save run' }));

    await waitFor(async () => {
      expect(await db.productionRuns.where('buildPlanId').equals(BUILD_PLAN_ID).count()).toBe(1);
    });
    const run = (await db.productionRuns.where('buildPlanId').equals(BUILD_PLAN_ID).toArray())[0];
    expect(run.sourceJobId).toBe(4242);
  });

  it('renders a logged run as a table row with its snapshotted total cost', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    const row = (await screen.findByRole('cell', { name: /^320,000$/ })).closest('tr');
    expect(row).not.toBeNull();
  });

  it('edits a run by clicking its row, recomputing total cost', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('cell', { name: /^320,000$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit production run' });
    const jobFeeInput = within(dialog).getByLabelText('Total job cost');
    await user.clear(jobFeeInput);
    await user.type(jobFeeInput, '40000');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Save run' }));

    await waitFor(async () => {
      const updated = await db.productionRuns.get('run-1');
      expect(updated?.jobFee).toBe(40_000);
      expect(updated?.totalCost).toBe(340_000);
    });
  });

  it('deletes a run from within the edit modal, cascading to its linked sale', async () => {
    await addRun();
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${CHARACTER_ID}:txn:9001`,
      characterId: CHARACTER_ID,
      runId: 'run-1',
      transactionId: 9001,
      quantity: 5,
      unitPrice: 100_000,
      linkedAt: now,
      updatedAt: now,
    });
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('cell', { name: /^320,000$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit production run' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete production run' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete production run' });
    expect(screen.queryByRole('dialog', { name: 'Edit production run' })).not.toBeInTheDocument();
    expect(await db.productionRuns.count()).toBe(1);
    await user.click(within(confirm).getByRole('button', { name: 'Delete production run' }));

    await waitFor(async () => {
      expect(await db.productionRuns.count()).toBe(0);
    });
    expect(await db.productionSaleLinks.count()).toBe(0);
  });

  it('keeps the run when the edit-modal delete confirmation is cancelled', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('cell', { name: /^320,000$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit production run' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete production run' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete production run' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Delete production run' })
      ).not.toBeInTheDocument();
    });
    expect(await db.productionRuns.count()).toBe(1);
  });

  it('deletes a run from the Sold menu once confirmed, cascading to its linked sale', async () => {
    await addRun();
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${CHARACTER_ID}:txn:9001`,
      characterId: CHARACTER_ID,
      runId: 'run-1',
      transactionId: 9001,
      quantity: 5,
      unitPrice: 100_000,
      linkedAt: now,
      updatedAt: now,
    });
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Delete production run…');
    const dialog = await screen.findByRole('dialog', { name: 'Delete production run' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete production run' }));

    await waitFor(async () => {
      expect(await db.productionRuns.count()).toBe(0);
    });
    expect(await db.productionSaleLinks.count()).toBe(0);
  });

  it('keeps the run when the delete confirmation is cancelled', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Delete production run…');
    const dialog = await screen.findByRole('dialog', { name: 'Delete production run' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Delete production run' })
      ).not.toBeInTheDocument();
    });
    expect(await db.productionRuns.count()).toBe(1);
  });

  it('links a past sale via the Sold button and shows realized profit', async () => {
    await addRun();
    loadWalletTransactions.mockResolvedValue({
      data: [txn()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('button', { name: 'Sold…' }));
    await waitFor(() => screen.getByRole('button', { name: 'Link' }));
    await user.click(screen.getByRole('button', { name: 'Link' }));

    await waitFor(async () => {
      expect(await db.productionSaleLinks.count()).toBe(1);
    });
    const link = (await db.productionSaleLinks.toArray())[0];
    expect(link).toMatchObject({
      id: `${CHARACTER_ID}:txn:9001`,
      runId: 'run-1',
      transactionId: 9001,
      quantity: 5,
      unitPrice: 100_000,
    });

    // 5 * 100_000 = 500_000 gross revenue, shown once the link lands.
    await waitFor(() => {
      expect(screen.getByText(/500,000|500000/)).toBeInTheDocument();
    });
  });

  it('hides the realized-profit breakdown trigger until something has sold', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('cell', { name: /^320,000$/ });

    expect(screen.queryByRole('button', { name: 'Calculations?' })).not.toBeInTheDocument();
  });

  it('opens a realized-profit breakdown with the confirmed sale figures once sold', async () => {
    await addRun();
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${CHARACTER_ID}:txn:9001`,
      characterId: CHARACTER_ID,
      runId: 'run-1',
      transactionId: 9001,
      quantity: 5,
      unitPrice: 100_000,
      linkedAt: now,
      updatedAt: now,
    });
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('button', { name: 'Calculations?' }));
    const dialog = await screen.findByRole('dialog', {
      name: "How this run's realized profit is calculated",
    });

    // grossRevenue 500,000; salesTax 7.5% (Accounting 0) = 37,500; no watched
    // order so brokerFeeableRevenue is 0 and broker fee is 0; netRevenue
    // 462,500; totalCost 320,000 (300,000 material + 20,000 job fee); profit
    // 142,500; margin 142,500 / 500,000 = 28.5%.
    expect(within(dialog).getByText('Gross revenue = 500,000')).toBeInTheDocument();
    expect(within(dialog).getByText('Sales tax = 37,500')).toBeInTheDocument();
    expect(within(dialog).getByText('Broker fee = 0')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Net revenue = 500,000 − sales tax 37,500 − broker fee 0 = 462,500')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Profit = net revenue 462,500 − total cost 320,000 = 142,500')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Margin: 28.5% of gross revenue.')).toBeInTheDocument();
  });

  it('rejects linking the same transaction twice, even across runs', async () => {
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${CHARACTER_ID}:txn:9001`,
      characterId: CHARACTER_ID,
      runId: 'other-run',
      transactionId: 9001,
      quantity: 5,
      unitPrice: 100_000,
      linkedAt: now,
      updatedAt: now,
    });
    await addRun();
    loadWalletTransactions.mockResolvedValue({
      data: [txn()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);

    await user.click(await screen.findByRole('button', { name: 'Sold…' }));

    // Already linked to another run — the picker must not offer it again.
    await waitFor(() => {
      expect(
        screen.getByText('No unlinked past sales of this item found in the cached wallet history.')
      ).toBeInTheDocument();
    });
  });

  it('watches an open sell order via the split-button menu and reflects it once refreshed', async () => {
    await addRun({ quantity: 10, totalCost: 550_000, materialCost: 500_000, jobFee: 50_000 });
    loadOrders.mockResolvedValue({
      cached: { data: [order()], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });

    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Watch Open Order');
    await waitFor(() => screen.getByRole('button', { name: 'Watch' }));
    await user.click(screen.getByRole('button', { name: 'Watch' }));

    await waitFor(async () => {
      expect(await db.productionOrderWatches.count()).toBe(1);
    });
    const watch = (await db.productionOrderWatches.toArray())[0];
    expect(watch).toMatchObject({
      id: `${CHARACTER_ID}:order:8001`,
      runId: 'run-1',
      orderId: 8001,
      initialVolumeRemain: 10,
      lastKnownVolumeRemain: 10,
      closed: false,
    });

    // Simulate a partial fill, then refresh.
    loadOrders.mockResolvedValue({
      cached: {
        data: [order({ volume_remain: 6 })],
        fetchedAt: new Date(),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(async () => {
      const updated = await db.productionOrderWatches.get(`${CHARACTER_ID}:order:8001`);
      expect(updated?.lastKnownVolumeRemain).toBe(6);
    });
  });

  it('records a manual / private sale with no transactionId', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Manual / Private Sale');
    const dialog = await screen.findByRole('dialog', { name: 'Manual / Private Sale' });
    await user.type(within(dialog).getByLabelText('Qty'), '3');
    await user.type(within(dialog).getByLabelText('Unit price'), '80000');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Save run' }));

    await waitFor(async () => {
      expect(await db.productionSaleLinks.count()).toBe(1);
    });
    const link = (await db.productionSaleLinks.toArray())[0];
    expect(link.transactionId).toBeUndefined();
    expect(link).toMatchObject({ runId: 'run-1', quantity: 3, unitPrice: 80_000 });
  });

  it('announces an error and marks the fields invalid instead of saving an empty manual sale', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Manual / Private Sale');
    const dialog = await screen.findByRole('dialog', { name: 'Manual / Private Sale' });
    await user.click(within(dialog).getByRole('button', { name: 'Save run' }));

    const alerts = within(dialog).getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    const qtyInput = within(dialog).getByLabelText('Qty');
    const priceInput = within(dialog).getByLabelText('Unit price');
    expect(qtyInput.getAttribute('aria-invalid')).toBe('true');
    expect(priceInput.getAttribute('aria-invalid')).toBe('true');
    expect(qtyInput.getAttribute('aria-describedby')).toBe(alerts[0].id);
    expect(priceInput.getAttribute('aria-describedby')).toBe(alerts[1].id);
    expect(await db.productionSaleLinks.count()).toBe(0);
    expect(screen.getByRole('dialog', { name: 'Manual / Private Sale' })).toBeTruthy();
  });

  it('marks units as lost with typed insurance, shows the badge, and writes them off open inventory', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Mark as lost…');
    const dialog = await screen.findByRole('dialog', { name: 'Mark as lost' });
    const units = within(dialog).getByLabelText('Units lost');
    await user.clear(units);
    await user.type(units, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Type ISK' }));
    await user.type(within(dialog).getByLabelText('Insurance payout (ISK)'), '50000');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Mark as lost' }));

    await waitFor(async () => {
      expect(await db.productionLosses.count()).toBe(1);
    });
    const saved = (await db.productionLosses.toArray())[0];
    expect(saved).toMatchObject({ runId: 'run-1', quantity: 2, insurancePayout: 50_000 });
    expect(await screen.findByText('2 lost')).toBeTruthy();
  });

  it('rejects losing more units than remain unaccounted for', async () => {
    await addRun();
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByRole('button', { name: 'Sold…' });

    await chooseSoldMenuItem(user, 'Mark as lost…');
    const dialog = await screen.findByRole('dialog', { name: 'Mark as lost' });
    const units = within(dialog).getByLabelText('Units lost');
    await user.clear(units);
    await user.type(units, '9');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Mark as lost' }));

    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(await db.productionLosses.count()).toBe(0);
  });

  it('removes a loss after one confirmation', async () => {
    await addRun();
    const now = Date.now();
    await db.productionLosses.add({
      id: `${CHARACTER_ID}:loss:abc`,
      characterId: CHARACTER_ID,
      runId: 'run-1',
      quantity: 2,
      lostAt: now,
      insurancePayout: 0,
      createdAt: now,
      updatedAt: now,
    });
    const user = userEvent.setup();
    renderPanel(null);
    await expandRuns(user);
    await screen.findByText('2 lost');

    await chooseSoldMenuItem(user, 'Remove loss…');
    const dialog = await screen.findByRole('dialog', { name: 'Remove loss' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove loss' }));

    await waitFor(async () => {
      expect(await db.productionLosses.count()).toBe(0);
    });
  });

  it('opens the Log Production dialog on a bumped logRequest, without clicking', async () => {
    const { rerender } = render(
      <ProductionRunsPanel
        characterId={CHARACTER_ID}
        buildPlanId={BUILD_PLAN_ID}
        defaults={null}
        productTypeID={PRODUCT_TYPE_ID}
        productName="Rifter"
        skills={{}}
        logRequest={0}
      />
    );

    rerender(
      <ProductionRunsPanel
        characterId={CHARACTER_ID}
        buildPlanId={BUILD_PLAN_ID}
        defaults={null}
        productTypeID={PRODUCT_TYPE_ID}
        productName="Rifter"
        skills={{}}
        logRequest={1}
      />
    );

    expect(await screen.findByRole('button', { name: 'Save run' })).toBeVisible();
  });
});

describe('ProductionRunsPanel input validation', () => {
  const DEFAULTS = { quantity: 10, materialCost: 500_000, jobFee: 50_000 };

  async function openLog(user: ReturnType<typeof userEvent.setup>) {
    renderPanel(DEFAULTS);
    await user.click(screen.getByRole('button', { name: 'Log Production' }));
    return screen.findByRole('dialog', { name: 'Log Production' });
  }

  async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
    await addRun();
    renderPanel(null);
    await expandRuns(user);
    await user.click(await screen.findByRole('cell', { name: /^320,000$/ }));
    return screen.findByRole('dialog', { name: 'Edit production run' });
  }

  async function blank(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    label: string
  ) {
    await user.clear(within(dialog).getByLabelText(label));
    await user.tab();
  }

  async function save(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole('button', { name: 'Save run' }));
  }

  it('log: refuses a blank Quantity, writes nothing, stays open with the error', async () => {
    const user = userEvent.setup();
    const dialog = await openLog(user);
    await blank(user, dialog, 'Qty');
    await save(user, dialog);

    const qty = within(dialog).getByLabelText('Qty');
    expect(qty.getAttribute('aria-invalid')).toBe('true');
    expect(within(dialog).getByRole('alert').id).toBe(qty.getAttribute('aria-describedby'));
    expect(await db.productionRuns.count()).toBe(0);
    expect(scheduleSync).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Log Production' })).toBeTruthy();
  });

  it('log: clears the Quantity error once the value is valid', async () => {
    const user = userEvent.setup();
    const dialog = await openLog(user);
    await blank(user, dialog, 'Qty');
    await save(user, dialog);
    expect(within(dialog).getByRole('alert')).toBeTruthy();

    await user.type(within(dialog).getByLabelText('Qty'), '3');
    await user.tab();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('log: refuses when both costs are cleared', async () => {
    const user = userEvent.setup();
    const dialog = await openLog(user);
    await blank(user, dialog, 'Material cost');
    await blank(user, dialog, 'Total job cost');
    await save(user, dialog);

    expect(within(dialog).getByLabelText('Material cost').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(within(dialog).getByLabelText('Total job cost').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(await db.productionRuns.count()).toBe(0);
    expect(scheduleSync).not.toHaveBeenCalled();
  });

  it('log: saves when only one cost is cleared', async () => {
    const user = userEvent.setup();
    const dialog = await openLog(user);
    await blank(user, dialog, 'Material cost');
    await save(user, dialog);

    await waitFor(async () => {
      expect(await db.productionRuns.count()).toBe(1);
    });
    const [run] = await db.productionRuns.toArray();
    expect(run).toMatchObject({ materialCost: 0, jobFee: 50_000, totalCost: 50_000 });
    expect(scheduleSync).toHaveBeenCalledTimes(1);
  });

  it('edit: refuses a blank Quantity instead of keeping the old value', async () => {
    const user = userEvent.setup();
    const dialog = await openEditDialog(user);
    await blank(user, dialog, 'Qty');
    await save(user, dialog);

    expect(within(dialog).getByLabelText('Qty').getAttribute('aria-invalid')).toBe('true');
    expect((await db.productionRuns.get('run-1'))?.quantity).toBe(5);
    expect(scheduleSync).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit production run' })).toBeTruthy();
  });

  it('edit: refuses when both costs are cleared; Cancel leaves the run unchanged', async () => {
    const user = userEvent.setup();
    const dialog = await openEditDialog(user);
    await blank(user, dialog, 'Material cost');
    await blank(user, dialog, 'Total job cost');
    await save(user, dialog);

    expect(within(dialog).getByLabelText('Material cost').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(scheduleSync).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit production run' })).toBeNull();
    });
    expect(await db.productionRuns.get('run-1')).toMatchObject({
      quantity: 5,
      materialCost: 300_000,
      jobFee: 20_000,
      totalCost: 320_000,
    });
  });

  it('edit: saves when only one cost is cleared', async () => {
    const user = userEvent.setup();
    const dialog = await openEditDialog(user);
    await blank(user, dialog, 'Total job cost');
    await save(user, dialog);

    await waitFor(async () => {
      expect(await db.productionRuns.get('run-1')).toMatchObject({
        jobFee: 0,
        totalCost: 300_000,
      });
    });
  });
});

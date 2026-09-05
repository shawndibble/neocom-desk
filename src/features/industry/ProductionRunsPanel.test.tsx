import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { WalletTransaction } from '@/esi/endpoints';
import type { MarketOrder } from '@/esi/endpoints';
import { ProductionRunsPanel } from './ProductionRunsPanel';

const loadWalletTransactions = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/wallet', () => ({ loadWalletTransactions }));

const loadOrders = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/orders', () => ({ loadOrders }));

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

beforeEach(async () => {
  await db.productionRuns.clear();
  await db.productionSaleLinks.clear();
  await db.productionOrderWatches.clear();
  loadWalletTransactions.mockReset().mockResolvedValue(null);
  loadOrders.mockReset().mockResolvedValue({ cached: null, needsReauth: false });
});

function renderPanel(defaults: { quantity: number; materialCost: number; jobFee: number } | null) {
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

describe('ProductionRunsPanel', () => {
  it('shows the empty state with no logged runs', () => {
    renderPanel(null);
    expect(screen.getByText('No production runs logged yet')).toBeInTheDocument();
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

  it('links a past sale and shows realized profit', async () => {
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
    });
    loadWalletTransactions.mockResolvedValue({
      data: [txn()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    const user = userEvent.setup();
    renderPanel(null);

    await user.click(await screen.findByRole('button', { name: 'Link Past Sale' }));
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
    });
    loadWalletTransactions.mockResolvedValue({
      data: [txn()],
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    const user = userEvent.setup();
    renderPanel(null);

    await user.click(await screen.findByRole('button', { name: 'Link Past Sale' }));

    // Already linked to another run — the picker must not offer it again.
    await waitFor(() => {
      expect(
        screen.getByText('No unlinked past sales of this item found in the cached wallet history.')
      ).toBeInTheDocument();
    });
  });

  it('deletes a run and cascades to its linked sale', async () => {
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
    });
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

    await user.click(await screen.findByRole('button', { name: 'Delete production run' }));

    await waitFor(async () => {
      expect(await db.productionRuns.count()).toBe(0);
    });
    expect(await db.productionSaleLinks.count()).toBe(0);
  });

  it('watches an open sell order and reflects it in quantity sold once filled', async () => {
    const now = Date.now();
    await db.productionRuns.add({
      id: 'run-1',
      characterId: CHARACTER_ID,
      buildPlanId: BUILD_PLAN_ID,
      productTypeID: PRODUCT_TYPE_ID,
      quantity: 10,
      materialCost: 500_000,
      jobFee: 50_000,
      totalCost: 550_000,
      loggedAt: now,
      updatedAt: now,
    });
    loadOrders.mockResolvedValue({
      cached: { data: [order()], fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
    });

    const user = userEvent.setup();
    renderPanel(null);

    await user.click(await screen.findByRole('button', { name: 'Watch Open Order' }));
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
});

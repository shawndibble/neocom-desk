import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
import { ProductionLogPanel } from './ProductionLogPanel';

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

beforeEach(async () => {
  await db.productionRuns.clear();
  await db.productionSaleLinks.clear();
  await db.productionOrderWatches.clear();
});

describe('ProductionLogPanel', () => {
  it('shows the empty state with no runs logged anywhere', () => {
    render(<ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} />);
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

    render(<ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} />);

    // Total cost logged across both runs.
    expect(await screen.findByText(/770,000|770000/)).toBeInTheDocument();
  });

  it('groups the "By item" table by product, not by run', async () => {
    await addRun({ id: 'run-1', productTypeID: RIFTER_TYPE_ID });
    await addRun({ id: 'run-2', productTypeID: RIFTER_TYPE_ID, buildPlanId: 'plan-2' });
    await addRun({ id: 'run-3', productTypeID: RAVEN_TYPE_ID, buildPlanId: 'plan-3', quantity: 1 });

    render(<ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} />);

    const rifterRow = (await screen.findByText('Rifter')).closest('tr');
    expect(rifterRow).not.toBeNull();
    // Two runs of 10 units each rolled into one Rifter row.
    expect(rifterRow?.textContent).toContain('2'); // runs logged
    expect(rifterRow?.textContent).toContain('20'); // units produced

    expect(await screen.findByText('Raven')).toBeInTheDocument();
  });

  it('falls back to a typeID label when the catalog has no entry for it', async () => {
    await addRun({ productTypeID: 999999 });
    render(<ProductionLogPanel characterId={CHARACTER_ID} catalog={CATALOG} skills={{}} />);
    expect(await screen.findByText('#999999')).toBeInTheDocument();
  });
});

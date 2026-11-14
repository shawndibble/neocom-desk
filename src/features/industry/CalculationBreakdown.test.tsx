import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { BuildResult } from '@/engine/industry/types';
import { CalculationBreakdown, type BreakdownContext } from './CalculationBreakdown';

const CONTEXT: BreakdownContext = {
  hubName: 'Jita',
  materialPriceBasis: 'buy',
  me: 10,
  isReaction: false,
  accountingLevel: 0,
  brokerRelationsLevel: 5,
  systemCostIndex: 0.023,
  costIndexSystemName: 'Jita',
  productName: 'Rifter',
  productQuantity: 10,
  productUnitPrice: 100000,
};

const RESULT: BuildResult = {
  materials: [],
  seconds: 3600,
  jobFee: { eiv: 1000, grossCost: 50, sccSurcharge: 10, facilityTax: 5, total: 65 },
  materialCost: 500,
  totalCost: 565,
  buyCost: 1000,
  revenue: 1000,
  salesTax: 10,
  brokerFee: 5,
  netRevenue: 985,
  profit: 435,
  marginPct: 77,
  iskPerHour: 435,
  grossProfit: 460,
  grossMargin: 82,
  grossIskPerHour: 460,
  breakEvenPrice: 92.5,
  unpricedMaterials: [],
  unpriceable: false,
  recommendation: 'build',
};

function renderBreakdown(context: Partial<BreakdownContext> = {}) {
  render(
    <CalculationBreakdown
      open
      onClose={() => {}}
      result={RESULT}
      context={{ ...CONTEXT, ...context }}
    />
  );
}

describe('CalculationBreakdown: the buy-order placement fee (issue #6167)', () => {
  it('names the broker fee folded into Buy order material prices, at the plan rate', () => {
    renderBreakdown();
    expect(screen.getByText(/Broker fee for placing those buy orders: 1\.5%/)).toBeInTheDocument();
  });

  it('names the Safety Tax too at a hub that charges one', () => {
    renderBreakdown({ standing: { factionStanding: 0, corpStanding: 0, safetyTaxPct: 5 } });
    expect(
      screen.getByText(/Broker fee and Safety Tax for placing those buy orders: 6\.5%/)
    ).toBeInTheDocument();
  });

  it('says nothing about it on Buy now', () => {
    renderBreakdown({ materialPriceBasis: 'sell' });
    expect(screen.queryByText(/placing those buy orders/)).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import { YieldDetailModal } from './YieldDetailModal';
import type { MiningYieldRow } from './yieldSnapshot';

const VELDSPAR = 1230;
const GAS = 25268;
const TRITANIUM = 34;
const SYSTEM = 30000142;

const typeNames = new Map([
  [VELDSPAR, 'Veldspar'],
  [GAS, 'Amber Cytoserocin'],
  [TRITANIUM, 'Tritanium'],
]);
const typeVolumes = new Map([
  [VELDSPAR, 0.1],
  [GAS, 10],
]);

function row(overrides: Partial<MiningYieldRow> = {}): MiningYieldRow {
  const base: Omit<MiningYieldRow, 'byBasis'> = {
    characterId: 1,
    characterName: 'Miner Alt',
    entry: {
      characterId: 1,
      date: '2026-09-08',
      solarSystemId: SYSTEM,
      oreLines: [
        { typeId: VELDSPAR, quantity: 250 },
        { typeId: GAS, quantity: 40 },
      ],
    },
    valuation: {
      rawValue: 1000,
      refineValue: 1200,
      pricedAll: false,
      efficiency: 0.5,
      implantBonusPct: 0,
      lines: [
        {
          typeId: VELDSPAR,
          quantity: 250,
          rawValue: 1000,
          refineValue: 1200,
          refineOutputs: [{ typeId: TRITANIUM, quantity: 400 }],
          batches: 2,
          unitsLeftOver: 50,
        },
        {
          typeId: GAS,
          quantity: 40,
          rawValue: 0,
          refineValue: 0,
          refineOutputs: [],
          batches: 0,
          unitsLeftOver: 0,
        },
      ],
    },
    materialUnitPrices: new Map([[TRITANIUM, 3]]),
    priceSource: 'saved',
    ...overrides,
  };
  const valued = {
    valuation: base.valuation,
    materialUnitPrices: base.materialUnitPrices,
    priceSource: base.priceSource,
  };
  return {
    ...base,
    byBasis: { buy: valued, sell: valued, 'now-buy': valued, 'now-sell': valued },
  };
}

function renderModal(value = row(), { showRefining = true }: { showRefining?: boolean } = {}) {
  render(
    <YieldDetailModal
      open
      onClose={() => {}}
      row={value}
      systemName="Jita"
      systemSecurity={0.9}
      typeNames={typeNames}
      typeVolumes={typeVolumes}
      showRefining={showRefining}
    />
  );
}

describe('YieldDetailModal', () => {
  it('names the day, the system and the character that mined it', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: /Mined 2026-09-08 — Jita/ })).toBeInTheDocument();
    expect(screen.getByText('Miner Alt')).toBeInTheDocument();
  });

  it('lists each ore type with its units and m³', () => {
    renderModal();
    const ore = screen.getByRole('table', { name: 'Ore mined' });
    const veldspar = within(ore).getByRole('row', { name: /Veldspar/ });
    expect(within(veldspar).getByText('250')).toBeInTheDocument();
    // 250 units x 0.1 m³
    expect(within(veldspar).getByText('25')).toBeInTheDocument();
  });

  it('shows an unpriced line as an em dash, never as zero ISK', () => {
    renderModal();
    const ore = screen.getByRole('table', { name: 'Ore mined' });
    const gas = within(ore).getByRole('row', { name: /Amber Cytoserocin/ });
    expect(within(gas).getAllByText('—')).toHaveLength(2);
  });

  it('pairs the ore table’s four figures per stacked card, and leaves the refined list alone', () => {
    renderModal();
    // The `.dt-stack-2col` grid itself lives in a `@media (width < 40rem)`
    // block jsdom cannot evaluate, so this pins the prop reaching the table;
    // `e2e/miningTaxYieldDetailNarrow.spec.ts` measures the real layout.
    expect(screen.getByRole('table', { name: 'Ore mined' })).toHaveClass('dt-stack-2col');
    // Two non-primary columns is already a short card — pairing it buys
    // nothing, so this table deliberately stays at the default.
    expect(screen.getByRole('table', { name: 'Refines into' })).not.toHaveClass('dt-stack-2col');
  });

  it('folds every line into what the whole day refines into', () => {
    renderModal();
    const refined = screen.getByRole('table', { name: 'Refines into' });
    const tritanium = within(refined).getByRole('row', { name: /Tritanium/ });
    expect(within(tritanium).getByText('400')).toBeInTheDocument();
  });

  it('says how many units fall short of a whole batch', () => {
    renderModal();
    expect(screen.getByText(/50 units fall short of a whole batch/)).toBeInTheDocument();
  });

  it('says nothing about an implant when none is fitted', () => {
    renderModal();
    expect(screen.queryByText(/fitted refining implant/)).not.toBeInTheDocument();
  });

  it("names the fitted refining implant's bonus (issue #1227)", () => {
    renderModal(row({ valuation: { ...row().valuation, implantBonusPct: 2 } }));
    expect(
      screen.getByText(
        "Includes the active clone's fitted refining implant, +2% to ore and ice yield."
      )
    ).toBeInTheDocument();
  });

  it('marks the exit worth more as the suggested one, and signs the gain', () => {
    renderModal();
    expect(screen.getByText('Refine, then sell')).toHaveClass('text-accent');
    expect(screen.getByText('Sell raw')).not.toHaveClass('text-accent');
    expect(screen.getByText(/\+20\.0% over selling raw/)).toBeInTheDocument();
  });

  it('suggests selling raw, and reddens the shortfall, when refining loses', () => {
    const losing = row();
    losing.valuation = { ...losing.valuation, rawValue: 1200, refineValue: 1000 };
    renderModal(losing);
    expect(screen.getByText('Sell raw')).toHaveClass('text-accent');
    expect(screen.getByText('Refining loses')).toBeInTheDocument();
    expect(screen.getByText(/-16\.7% against selling raw/)).toBeInTheDocument();
  });

  it('greens the higher of a line’s raw and refined value', () => {
    renderModal();
    const ore = screen.getByRole('table', { name: 'Ore mined' });
    const veldspar = within(ore).getByRole('row', { name: /Veldspar/ });
    expect(within(veldspar).getByLabelText('1,200 ISK')).toHaveClass('text-isk-pos');
    expect(within(veldspar).getByLabelText('1,000 ISK')).not.toHaveClass('text-isk-pos');
  });

  it('suggests nothing on a day where nothing priced', () => {
    const unpriced = row();
    unpriced.valuation = {
      ...unpriced.valuation,
      rawValue: 0,
      refineValue: 0,
      lines: unpriced.valuation.lines.map((line) => ({ ...line, rawValue: 0, refineValue: 0 })),
    };
    renderModal(unpriced);
    expect(screen.getByText('Sell raw')).not.toHaveClass('text-accent');
    expect(screen.getByText('Refine, then sell')).not.toHaveClass('text-accent');
    expect(screen.getByText('Refining vs. raw')).toBeInTheDocument();
    expect(screen.queryByText('Refining breaks even')).not.toBeInTheDocument();
  });

  it('states the mined-date price basis and the refining assumption', () => {
    renderModal();
    expect(screen.getByText(/Jita average on 2026-09-08/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Reprocessing and Reprocessing Efficiency skills at an NPC station's 50% base rate \(50.0% yield\)/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/no market history on this date/)).toBeInTheDocument();
  });

  describe('refining hidden (issue #1281)', () => {
    it('hides the refined-output section entirely', () => {
      renderModal(row(), { showRefining: false });
      expect(screen.queryByRole('table', { name: 'Refines into' })).not.toBeInTheDocument();
      expect(screen.queryByText('Refine, then sell')).not.toBeInTheDocument();
      expect(screen.queryByText(/over selling raw/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Reprocessing and Reprocessing Efficiency skills/)
      ).not.toBeInTheDocument();
      const ore = screen.getByRole('table', { name: 'Ore mined' });
      expect(within(ore).queryByText('Refined value')).not.toBeInTheDocument();
    });
  });
});

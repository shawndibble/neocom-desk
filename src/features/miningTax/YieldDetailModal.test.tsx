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
  return {
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
    ...overrides,
  };
}

function renderModal(value = row()) {
  render(
    <YieldDetailModal
      open
      onClose={() => {}}
      row={value}
      systemName="Jita"
      systemSecurity={0.9}
      typeNames={typeNames}
      typeVolumes={typeVolumes}
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
});

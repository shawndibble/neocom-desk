import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { UsedByModal } from './UsedByModal';

const NAMES: Record<number, string> = { 34: 'Tritanium', 100: 'Capital Ship', 200: 'Armor Plate' };
const nameFor = (typeID: number) => NAMES[typeID] ?? `#${typeID}`;

function line(typeID: number, quantity: number): ResolvedMaterial {
  return {
    typeID,
    baseQuantity: quantity,
    quantity,
    ownedQuantity: 0,
    remainingQuantity: quantity,
    unitPrice: 5,
    lineCost: quantity * 5,
    unpriced: false,
  };
}

const MATERIALS = [
  line(34, 100),
  {
    ...line(200, 4),
    subBuild: { typeID: 200, runs: 2, inputs: [line(34, 300)] },
  } as unknown as ResolvedMaterial,
];

function renderModal(tableTotal: number) {
  render(
    <UsedByModal
      typeID={34}
      onClose={() => {}}
      tableTotal={tableTotal}
      materials={MATERIALS}
      mainJob={{ typeID: 100, runs: 3 }}
      nameFor={nameFor}
    />
  );
}

describe('UsedByModal', () => {
  it('lists each consuming job with its runs and quantity', () => {
    renderModal(400);
    expect(screen.getByText('Tritanium · used by 2 jobs')).toBeInTheDocument();
    expect(screen.getByText('Capital Ship')).toBeInTheDocument();
    expect(screen.getByText('Armor Plate')).toBeInTheDocument();
    expect(screen.getByText('Table total 400 · jobs need 400')).toBeInTheDocument();
    expect(screen.queryByText('(round-up)')).not.toBeInTheDocument();
  });

  it('says so when the table total and the jobs differ', () => {
    renderModal(399);
    expect(screen.getByText(/Table total 399 · jobs need 400/)).toBeInTheDocument();
    expect(screen.getByText(/\(round-up\)/)).toBeInTheDocument();
  });
});

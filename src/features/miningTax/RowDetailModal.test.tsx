import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import { RowDetailModal } from './RowDetailModal';
import type { MoonMiningTaxRow } from './snapshot';

const VELDSPAR = 1230;
const SCORDITE = 1228;

const typeNames = new Map([
  [VELDSPAR, 'Veldspar'],
  [SCORDITE, 'Scordite'],
]);

const row: MoonMiningTaxRow = {
  characterId: 1,
  characterName: 'Miner Alt',
  entry: {
    characterId: 1,
    date: '2026-09-08',
    solarSystemId: 30000142,
    oreLines: [{ typeId: VELDSPAR, quantity: 250 }],
  },
  assignments: [],
  unassignedOreLines: [{ typeId: VELDSPAR, quantity: 250 }],
};

function renderModal(
  status: 'unassigned' | 'needs-review',
  assignment: MiningTaxAssignmentRecord | null
) {
  const noop = vi.fn();
  render(
    <MemoryRouter>
      <RowDetailModal
        open
        onClose={noop}
        row={row}
        assignment={assignment}
        status={status}
        systemName="Jita"
        systemSecurity={0.9}
        typeNames={typeNames}
        payees={[]}
        unitPrices={new Map()}
        pricesFor={() => new Map()}
        busy={false}
        onAssigned={noop}
        onDismiss={noop}
        onMarkPaid={noop}
        onResolve={noop}
        onUndo={noop}
      />
    </MemoryRouter>
  );
}

describe('RowDetailModal item names', () => {
  it('links each ore-line name to the Market', () => {
    renderModal('unassigned', null);
    const link = screen.getByRole('link', { name: 'Veldspar' });
    expect(link.getAttribute('href')).toContain(`/market/browser?`);
    expect(link.getAttribute('href')).toContain(String(VELDSPAR));
  });

  it('links each resolve-diff name to the Market', () => {
    renderModal('needs-review', {
      id: 'a1',
      characterId: 1,
      date: '2026-09-08',
      solarSystemId: 30000142,
      payeeId: 'p1',
      oreLines: [{ typeId: SCORDITE, quantity: 10 }],
      taxPct: 10,
      estimatedValue: 100,
      taxOwed: 10,
      status: 'needs-review',
      reviewDiff: [{ typeId: SCORDITE, before: 10, after: 12 }],
    } as MiningTaxAssignmentRecord);
    const links = screen.getAllByRole('link', { name: 'Scordite' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link.getAttribute('href')).toContain(String(SCORDITE));
  });
});

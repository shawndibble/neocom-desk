import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { CorpRowDetailModal } from './CorpRowDetailModal';
import type { CorpRowInfo } from './corpRows';

const ZEO = 45490;

const view: BookRowView = {
  id: '98000001:1:1000:2026-10-17',
  corporationId: 98000001,
  corpName: 'Brass Meridian Logistics',
  characterId: 1,
  date: '2026-10-17',
  solarSystemId: 30003838,
  state: 'billed',
  oreLines: [{ typeId: ZEO, quantity: 43_050 }],
  personalOreLines: [{ typeId: ZEO, quantity: 41_200 }],
  unitPrices: { [ZEO]: 148.2 },
  priceSources: { [ZEO]: 'saved' },
  taxPct: 15,
  rateScope: 'moon',
  rateEffectiveFrom: '2026-10-01',
  estimatedValue: 6_380_010,
  taxOwed: 957_001,
  billed: 957_001,
  hubId: 'jita',
  oreForm: 'compressed',
  dispute: {
    quantity: true,
    rate: true,
    personalQuantity: 41_200,
    bookQuantity: 43_050,
    personalPct: 10,
    bookPct: 15,
  },
};

const corp: Extract<CorpRowInfo, { kind: 'row' }> = {
  kind: 'row',
  view,
  corpName: 'Brass Meridian Logistics',
};

const dr = {
  key: view.id,
  status: 'outstanding',
  assignment: null,
  row: { characterName: 'Kestrel Vane' },
  corp,
} as unknown as DisplayRow;

function renderModal(over: Partial<Parameters<typeof CorpRowDetailModal>[0]> = {}) {
  const onPay = vi.fn();
  render(
    <MemoryRouter>
      <CorpRowDetailModal
        open
        onClose={vi.fn()}
        dr={dr}
        corp={corp}
        book={undefined}
        systemName="Efa"
        systemSecurity={-0.1}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onPay={onPay}
        {...over}
      />
    </MemoryRouter>
  );
  return { onPay };
}

describe('CorpRowDetailModal', () => {
  it('shows what the book bills, with the book and your own quantity', () => {
    renderModal();
    expect(screen.getByText('957,001 ISK')).toBeInTheDocument();
    expect(screen.getByText('Billed')).toBeInTheDocument();
    expect(screen.getByText('43,050 (book) · 41,200 (you)')).toBeInTheDocument();
    expect(screen.getAllByText(/15% per-moon rate from 2026-10-01/).length).toBeGreaterThan(0);
  });

  it('offers Settle up but no way to edit the book’s figures', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /settle up/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument();
  });

  it('opens the book diff as its own dialog from "Compare with the book…", not inline', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Disputed: quantity and rate differ')).toBeInTheDocument();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compare with the book…' }));
    const diff = await screen.findByRole('dialog', { name: /you and the book/i });
    expect(within(diff).getByText('You')).toBeInTheDocument();
    expect(within(diff).getAllByText('differs').length).toBeGreaterThanOrEqual(2);
    expect(within(diff).getByText('10%')).toBeInTheDocument();
    expect(within(diff).getByText(/Book rate 15% is the per-moon rate/)).toBeInTheDocument();
  });

  it('says Disputed: you 10%, book 15% when only the rate differs', () => {
    const rateOnly: BookRowView = {
      ...view,
      dispute: { ...view.dispute!, quantity: false },
    };
    renderModal({ corp: { ...corp, view: rateOnly } });
    expect(screen.getByText('Disputed: you 10%, book 15%')).toBeInTheDocument();
  });

  it('shows a corp dismissal with its reason and nothing to pay', () => {
    const dismissed: BookRowView = {
      ...view,
      state: 'dismissed',
      taxOwed: 0,
      dismissalReason: 'Fleet op, corp-sanctioned',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: dismissed } });
    expect(screen.getByText(/Fleet op, corp-sanctioned/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settle up/i })).not.toBeInTheDocument();
  });

  it('shows a conflict as not owed, with the day it resolves', () => {
    const conflict: BookRowView = {
      ...view,
      state: 'conflict',
      taxOwed: null,
      resolvesAt: '2026-11-01T06:00:00.000Z',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: conflict } });
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.getByText(/resolves to Brass Meridian Logistics on 2026-11-01/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settle up/i })).not.toBeInTheDocument();
  });

  it("gives the corporation's reason for a correction, and calls a write-off one (#4622)", () => {
    const corrected = {
      ...corp,
      view: {
        ...view,
        correction: {
          kind: 'write-off' as const,
          before: 900_000,
          after: 0,
          reasons: ['Goodwill'],
        },
      },
    };
    renderModal({ corp: corrected });
    expect(
      screen.getByText(/Written off by the corporation: 900,000 → 0\. Their reason: Goodwill/)
    ).toBeInTheDocument();
  });
});

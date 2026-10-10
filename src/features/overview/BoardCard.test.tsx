import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BoardCard, FoldedRow, NumberTile } from './BoardCard';
import {
  AlertsColumn,
  MailCard,
  MiningTaxCard,
  OrdersCard,
  PlanetaryCard,
  PriceAlertsCard,
} from './cards';
import type { DisplayAlertGroup } from '@/features/notifications/alertsFilter';
import { miningTaxSummaryNode } from './miningSummaryNode';

function renderCard(help?: string) {
  return render(
    <MemoryRouter>
      <BoardCard title="Card" to="/market/orders" openLabel="Open" help={help}>
        <NumberTile label="One" value={1} severity="watch" />
        <NumberTile label="Two" value={2} severity="watch" />
      </BoardCard>
    </MemoryRouter>
  );
}

describe('BoardCard help', () => {
  it('renders exactly one help affordance however many tiles the card has', () => {
    renderCard('Plain-language explanation.');
    expect(screen.getAllByRole('button', { name: 'About Card' })).toHaveLength(1);
  });

  it('renders no help affordance without help text', () => {
    renderCard();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MiningTaxCard scope', () => {
  it('reads out that it covers every Character (issue #2846)', () => {
    render(
      <MemoryRouter>
        <MiningTaxCard
          data={{
            unpaidIsk: 0,
            payeeCount: 0,
            unassignedCount: 0,
            oldestUnpaidDays: null,
            needsReauth: false,
            fetchedAt: null,
            characterCount: 3,
            missingCharacterNames: [],
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('All characters · 3')).toBeInTheDocument();
  });

  it('shows N of M when a Character needs re-auth', () => {
    render(
      <MemoryRouter>
        <MiningTaxCard
          data={{
            unpaidIsk: 0,
            payeeCount: 0,
            unassignedCount: 0,
            oldestUnpaidDays: null,
            needsReauth: true,
            fetchedAt: null,
            characterCount: 4,
            missingCharacterNames: ['Bex Roan'],
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('All characters · 3 of 4')).toBeInTheDocument();
  });
});

describe('Overview jargon cards', () => {
  it('give Orders, Mining tax and Planetary one help button each', () => {
    const { container } = render(
      <MemoryRouter>
        <OrdersCard rows={[]} characterId={1} maxOrders={null} needsReauth={false} />
        <MiningTaxCard data={null} />
        <PlanetaryCard data={null} />
      </MemoryRouter>
    );
    expect(container.querySelectorAll('section')).toHaveLength(3);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /about open orders/i })).toBeTruthy();
  });
});

describe('FoldedRow mining summary', () => {
  it('renders the owed ISK as an IskAmount with the exact figure, keeping the plain aria-label', () => {
    const data = {
      unpaidIsk: 412_600_000,
      unassignedCount: 0,
      payeeCount: 2,
      needsReauth: false,
    } as unknown as Parameters<typeof miningTaxSummaryNode>[0];
    render(
      <MemoryRouter>
        <ul>
          <FoldedRow
            domain="Mining tax"
            summary="412.6M unpaid"
            summaryNode={miningTaxSummaryNode(data)}
            severity={null}
            to="/mining/tax"
          />
        </ul>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: 'Mining tax: 412.6M unpaid' });
    expect(link.textContent).toContain('412.6M');
    expect(link.textContent).toMatch(/412,600,000/);
    expect(link.textContent).toContain('unpaid');
  });

  it('has no node when nothing is owed', () => {
    expect(miningTaxSummaryNode(null)).toBeUndefined();
  });
});

describe('Board row accessible names', () => {
  it('Mail rows name the sender, and drop it cleanly when unresolved', () => {
    const mail = (mailId: number, from: string | null) => ({
      mailId,
      subject: 'Fleet tonight',
      from,
      atMs: 0,
    });
    render(
      <MemoryRouter>
        <MailCard
          nowMs={3_600_000}
          data={{
            unread: 2,
            recent: [mail(1, 'Alice'), mail(2, null)],
            needsReauth: false,
            fetchedAt: null,
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Fleet tonight, .*, Alice \(/ })).toBeTruthy();
    const names = screen.getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? '');
    expect(names.some((n) => /Fleet tonight, [^,]*\s\([^)]+\)$/.test(n))).toBe(true);
    expect(names.every((n) => !/, \(|\(\)|, ,/.test(n))).toBe(true);
  });

  it('Price alert rows name the target and the severity', () => {
    render(
      <MemoryRouter>
        <PriceAlertsCard
          nowMs={0}
          data={{
            checkedAt: 0,
            alerts: [
              {
                typeId: 34,
                name: 'Tritanium',
                targetPrice: 5,
                direction: 'above',
                price: 6,
                crossed: true,
              },
            ],
          }}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Tritanium.*(at least).*(due soon)/i })).toBeTruthy();
  });
});

describe('AlertsColumn', () => {
  const group = (severity: DisplayAlertGroup['severity']): DisplayAlertGroup => ({
    key: severity,
    target: { kind: 'event', eventId: 'characterNotTraining' },
    severity,
    count: 1,
    newestFiredAt: 0,
    entries: [],
    characterIds: [],
    label: 'Character Not Training',
    muted: false,
  });

  it('names each row severity, not just colours it', () => {
    render(
      <MemoryRouter>
        <AlertsColumn
          groups={[group('warning'), group('critical')]}
          unread={0}
          onDismissAll={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('img', { name: /due soon/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /critical/i })).toBeTruthy();
  });

  it('moves focus to the heading when Dismiss all unmounts itself', () => {
    render(
      <MemoryRouter>
        <AlertsColumn groups={[group('warning')]} unread={1} onDismissAll={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Alerts' }));
  });
});

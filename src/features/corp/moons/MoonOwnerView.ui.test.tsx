import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { HandledByCard } from './HandledByCard';
import { MoonOwnerView } from './MoonOwnerView';
import { OwnerStaleBanner } from './OwnerStaleBanner';
import { fixtureView, nameOf } from './ownerViewFixtures';

function view(over = {}, props: Partial<Parameters<typeof MoonOwnerView>[0]> = {}) {
  const onRequestRate = vi.fn().mockResolvedValue(undefined);
  render(
    <MoonOwnerView
      view={fixtureView(over)}
      names={nameOf}
      canEdit
      onRequestRate={onRequestRate}
      {...props}
    />
  );
  return { onRequestRate };
}

describe('MoonOwnerView', () => {
  it('leads with the plain statement, then who mined, then payments and rate', () => {
    view();
    expect(
      screen.getByText('Brass Meridian Logistics handles the tax on your moons.')
    ).toBeVisible();
    expect(screen.getByText('13,024,480')).toBeVisible();
    expect(
      screen.getByText(
        /is owed to you for ore mined at your refineries since 1 Oct, at your rate of 8%/
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        /They have paid 20,000,000 so far; the last payment was 12,000,000 on 16 Oct/
      )
    ).toBeVisible();
    expect(screen.getByText('Varro Kestane')).toBeVisible();
    expect(screen.getAllByText('Ashfall Athanor II').length).toBeGreaterThan(0);
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings.indexOf('Mined at your refineries')).toBeLessThan(
      headings.indexOf('Payments and rate')
    );
    expect(document.body.textContent).not.toMatch(/feeder|collector/i);
  });

  it('has no "You asked" when nothing was asked for or the ask equals the new rate', () => {
    const agreed = {
      kind: 'agreed' as const,
      pct: 8,
      effectiveFrom: '2026-10-01',
      recordedAt: '2026-10-01T10:00:00Z',
    };
    view({ requestedRatePct: null, rateHistory: [agreed] });
    expect(screen.getByText('Your rate is 8%.')).toBeVisible();
    expect(screen.queryByText(/You asked/)).toBeNull();
  });

  it('shows the rate override line and the payments', () => {
    view();
    expect(
      screen.getByText('Rate set to 8% by Brass Meridian Logistics on 1 Oct. You asked for 6%.')
    ).toBeVisible();
    expect(screen.getByText(/16 Oct/, { selector: 'li' })).toHaveTextContent(
      'Matched in the wallet journal'
    );
  });

  it('asks for a different rate through a dialog', async () => {
    const { onRequestRate } = view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ask for a different rate…' }));
    const field = screen.getByLabelText('Rate you ask for (%)');
    await user.clear(field);
    await user.type(field, '7');
    await user.click(screen.getByRole('button', { name: 'Ask for this rate' }));
    await waitFor(() => expect(onRequestRate).toHaveBeenCalledWith(7));
  });

  it('hides the ask link from a non-officer', () => {
    view({}, { canEdit: false });
    expect(screen.queryByRole('button', { name: 'Ask for a different rate…' })).toBeNull();
  });

  it('says no rate is set and owes nothing in ISK', () => {
    view({
      effectiveRatePct: null,
      agreedRatePct: null,
      requestedRatePct: null,
      balanceKind: 'none',
      balanceIsk: 0,
    });
    expect(screen.getByText(/No rate is set, so nothing is owed to you yet/)).toBeVisible();
  });

  it('settled otherwise: the note, mined volume and value, no balance', () => {
    view({ mode: 'settled-otherwise', note: 'Fuel for their refineries', balanceKind: 'none' });
    expect(screen.getByText('Fuel for their refineries')).toBeVisible();
    expect(screen.getByText(/Nothing is owed in ISK/)).toBeVisible();
    expect(screen.getByText('412,806,000')).toBeVisible();
    expect(screen.queryByText('Payments and rate')).toBeNull();
    expect(screen.queryByText(/is owed to you/)).toBeNull();
  });

  it('after leaving and settled: only the one line, nothing under it', () => {
    view(
      { status: 'left', leftAt: Date.UTC(2026, 9, 12), balanceKind: 'even', balanceIsk: 0 },
      {
        card: (
          <HandledByCard
            summary={
              fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12), balanceKind: 'even' })
                .summary
            }
            name="Brass Meridian Logistics"
            canDismiss
            onDismiss={async () => undefined}
          />
        ),
      }
    );
    expect(screen.getByText('Previously handled by Brass Meridian Logistics')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    expect(screen.queryByText('Varro Kestane')).toBeNull();
  });

  it('after leaving and owed: the balance, history and no Dismiss', () => {
    const v = fixtureView({ status: 'left', leftAt: Date.UTC(2026, 9, 12) });
    render(
      <MoonOwnerView
        view={v}
        names={nameOf}
        canEdit
        onRequestRate={async () => undefined}
        card={
          <HandledByCard
            summary={v.summary}
            name="Brass Meridian Logistics"
            canDismiss
            onDismiss={async () => undefined}
          />
        }
      />
    );
    expect(screen.getByText('13,024,480')).toBeVisible();
    expect(screen.getByText(/for mining before 12 Oct/)).toBeVisible();
    expect(screen.getByText('Mined while they handled it')).toBeVisible();
    expect(screen.getByText('Payments to you')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByText('Payments and rate')).toBeNull();
  });
});

describe('OwnerStaleBanner', () => {
  it('names the date and reconnects', async () => {
    const onReconnect = vi.fn();
    render(<OwnerStaleBanner since={Date.UTC(2026, 9, 11)} onReconnect={onReconnect} />);
    expect(screen.getByText("We can't read your mining ledger since 11 Oct")).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalled();
  });
});

describe('HandledByCard', () => {
  it('dismisses through the callback and shows a failure', async () => {
    const onDismiss = vi.fn().mockRejectedValue(new Error('no'));
    render(
      <HandledByCard
        summary={fixtureView({ status: 'removed', balanceKind: 'even' }).summary}
        name="Brass Meridian Logistics"
        canDismiss
        onDismiss={onDismiss}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not dismiss');
  });
});

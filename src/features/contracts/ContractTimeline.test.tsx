import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@/i18n';
import type { TimelineStep } from '@/engine/contracts/contractTimeline';
import { ContractTimeline } from './ContractTimeline';

const issued = Date.UTC(2026, 9, 17, 17, 25);
const accepted = Date.UTC(2026, 9, 17, 18, 52);

describe('ContractTimeline', () => {
  it('lists each step with its stamp, in order', () => {
    const steps: TimelineStep[] = [
      { key: 'issued', done: true, atMs: issued },
      { key: 'accepted', done: true, atMs: accepted },
      { key: 'completed', done: true, atMs: accepted + 30_000, sameMinuteAsPrevious: true },
    ];
    render(<ContractTimeline steps={steps} />);
    const list = screen.getByRole('list', { name: 'Contract progress' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('b')?.textContent)).toEqual([
      'Issued',
      'Accepted',
      'Completed',
    ]);
  });

  it('says "Same minute" in place of a second stamp when completion followed acceptance at once', () => {
    render(
      <ContractTimeline
        steps={[
          { key: 'issued', done: true, atMs: issued },
          { key: 'accepted', done: true, atMs: accepted },
          { key: 'completed', done: true, atMs: accepted, sameMinuteAsPrevious: true },
        ]}
      />
    );
    expect(screen.getByText('Same minute')).toBeInTheDocument();
  });

  it('shows an unaccepted contract as waiting, ending on its expiry', () => {
    render(
      <ContractTimeline
        steps={[
          { key: 'issued', done: true, atMs: issued },
          { key: 'accepted', done: false, atMs: null },
          { key: 'expires', done: false, atMs: Date.UTC(2026, 9, 31, 17, 25) },
        ]}
      />
    );
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('does not rely on colour alone: a step that has not happened says so in text', () => {
    render(
      <ContractTimeline
        steps={[
          { key: 'issued', done: true, atMs: issued },
          { key: 'accepted', done: false, atMs: null },
          { key: 'expires', done: false, atMs: Date.UTC(2026, 9, 31, 17, 25) },
        ]}
      />
    );
    const accepted = screen.getByText('Accepted').closest('li')!;
    expect(accepted).toHaveTextContent('Waiting');
  });

  it('ends a withdrawn contract on its outcome, with no acceptance to wait for and no date to invent', () => {
    render(
      <ContractTimeline
        steps={[
          { key: 'issued', done: true, atMs: issued },
          { key: 'cancelled', done: true, atMs: null },
        ]}
      />
    );
    const steps = screen.getAllByRole('listitem');
    expect(steps.map((li) => li.querySelector('b')?.textContent)).toEqual(['Issued', 'Cancelled']);
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    // The outcome carries no second line: ESI does not say when.
    expect(steps[1]!.querySelector('span:not([aria-hidden])')).toBeNull();
  });

  it('names every way a contract can end without completing', () => {
    for (const [key, label] of [
      ['deleted', 'Deleted'],
      ['rejected', 'Rejected'],
      ['failed', 'Failed'],
      ['reversed', 'Reversed'],
    ] as const) {
      const { unmount } = render(
        <ContractTimeline
          steps={[
            { key: 'issued', done: true, atMs: issued },
            { key, done: true, atMs: null },
          ]}
        />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('dates a lapsed contract as expired, not as expiring', () => {
    render(
      <ContractTimeline
        steps={[
          { key: 'issued', done: true, atMs: issued },
          { key: 'expired', done: true, atMs: Date.UTC(2026, 9, 31, 17, 25) },
        ]}
      />
    );
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText('Expires')).not.toBeInTheDocument();
    expect(screen.getByText(/10\/31\/2026/)).toBeInTheDocument();
  });
});

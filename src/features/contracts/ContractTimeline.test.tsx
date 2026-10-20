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
});

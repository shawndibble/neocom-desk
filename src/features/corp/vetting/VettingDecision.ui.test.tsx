import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { VettingReview } from '@/engine/vetting';
import { VettingDecision } from './VettingDecision';

const review = (over: Partial<VettingReview> = {}): VettingReview => ({
  id: 'r-1',
  kind: 'application',
  state: 'open',
  pilot: { characterId: 1, name: 'Tamsin Vell', corporationName: 'Hollow Reach Mining' },
  characters: 1,
  flags: 0,
  missing: 0,
  signed: 0,
  needed: 1,
  yours: true,
  readAt: 1,
  createdAt: 1,
  decidedAt: null,
  corporationId: 98000001,
  note: '',
  barred: false,
  reportCharacters: [],
  parties: [],
  assessment: null,
  signOffs: [],
  log: [],
  deleteAt: null,
  ...over,
});

function setup(over: Partial<VettingReview> = {}) {
  const onDecide = vi.fn(async () => {});
  render(<VettingDecision review={review(over)} onDecide={onDecide} />);
  return onDecide;
}

describe('VettingDecision', () => {
  it('accepts at once, with the note', async () => {
    const onDecide = setup();
    expect(screen.getByText('Not decided')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note, kept with your decision'), 'Looks fine');
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onDecide).toHaveBeenCalledWith('yes', 'Looks fine');
  });

  it('rejects only through a confirm that needs a reason', async () => {
    const onDecide = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecide).not.toHaveBeenCalled();
    const dialog = within(await screen.findByRole('dialog', { name: 'Reject Tamsin Vell' }));
    const confirm = dialog.getByRole('button', { name: 'Reject' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(confirm);
    expect(onDecide).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText('Reason, kept with your decision'), 'ISK from BKS');
    await userEvent.click(confirm);
    expect(onDecide).toHaveBeenCalledWith('no', 'ISK from BKS');
  });

  it('keeps another reviewer’s decision hidden until the caller decides', () => {
    setup({
      kind: 'promotion',
      needed: 2,
      signed: 1,
      signOffs: [{ characterId: 5, name: 'Ilse Marrow', you: false, at: Date.UTC(2026, 10, 11) }],
    });
    const row = within(screen.getByText('Ilse Marrow').closest('li')!);
    expect(row.getByText(/Hidden until you decide/)).toBeInTheDocument();
    expect(row.getByText('Decided')).toBeInTheDocument();
    expect(row.queryByText('Approved')).toBeNull();
    expect(row.queryByText('Objected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Object' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 sign-offs')).toBeInTheDocument();
  });

  it('shows every decision and its note once the caller has decided, with nothing left to press', () => {
    setup({
      kind: 'promotion',
      yours: false,
      needed: 2,
      signed: 2,
      signOffs: [
        {
          characterId: 5,
          name: 'Ilse Marrow',
          you: false,
          at: 1,
          decision: 'no',
          note: 'Too soon.',
        },
        { characterId: 6, name: 'Kestrel Vane', you: true, at: 2, decision: 'yes', note: '' },
      ],
    });
    expect(screen.getByText('Objected')).toBeInTheDocument();
    expect(screen.getByText('Too soon.')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Object' })).toBeNull();
  });

  it('bars whoever asked for the review from signing it off', () => {
    setup({
      kind: 'promotion',
      barred: true,
      yours: false,
      needed: 2,
      requestedBy: { characterId: 6, name: 'Kestrel Vane' },
    });
    expect(screen.getByText('Cannot sign')).toBeInTheDocument();
    expect(screen.getByText('Asked for this review')).toBeInTheDocument();
    expect(
      screen.getByText('You asked for this review, so you cannot sign it off.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps the reason and says why when the server refuses', async () => {
    const onDecide = vi.fn(async () => {
      throw Object.assign(new Error('x'), { details: { reason: 'already-signed' } });
    });
    render(<VettingDecision review={review()} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Reason, kept with your decision'), 'No');
    await userEvent.click(dialog.getByRole('button', { name: 'Reject' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'You already signed this review off.'
    );
    expect(dialog.getByLabelText('Reason, kept with your decision')).toHaveValue('No');
  });
});

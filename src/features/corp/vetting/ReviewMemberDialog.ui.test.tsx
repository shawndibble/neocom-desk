import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ReviewMemberDialog } from './ReviewMemberDialog';
import { markMembers, type RosterMember } from './reviewRoster';
import type { ReviewRosterState } from './useReviewRoster';

const MEMBERS: RosterMember[] = [
  { characterId: 1, name: 'Ren Halvard', title: 'Miner' },
  { characterId: 2, name: 'Renna Oku', title: 'Hauler' },
  { characterId: 3, name: 'Pell Okonru' },
  { characterId: 4, name: 'Kestrel Vane' },
];
const READY: ReviewRosterState = {
  status: 'ready',
  roster: { members: MEMBERS, titles: ['Miner', 'Hauler'] },
};
const mark = (members: readonly RosterMember[]) =>
  markMembers(members, {
    selfId: 4,
    waiting: new Map([[3, { at: Date.now() - 2 * 86_400_000, by: 'Ilse Marrow' }]]),
  });

function setup(roster: ReviewRosterState = READY) {
  const onRequest = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ReviewMemberDialog roster={roster} mark={mark} onRequest={onRequest} onClose={onClose} />
  );
  return { onRequest, onClose, dialog: within(screen.getByRole('dialog')) };
}

describe('ReviewMemberDialog', () => {
  it('narrows the roster by typing, picks with the keyboard, fills the role from a chip', async () => {
    const { dialog, onRequest } = setup();
    const box = dialog.getByRole('combobox');
    expect(dialog.getAllByRole('option')).toHaveLength(4);
    await userEvent.type(box, 'ren');
    expect(dialog.getAllByRole('option')).toHaveLength(2);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(dialog.getByText('Renna Oku')).toBeInTheDocument();
    expect(dialog.queryByRole('combobox')).toBeNull();
    const ask = dialog.getByRole('button', { name: 'Ask for a review' });
    expect(ask).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(dialog.getByRole('button', { name: 'Hauler' }));
    await userEvent.click(ask);
    expect(onRequest).toHaveBeenCalledWith('Renna Oku', 'Hauler');
  });

  it('keeps a waiting review and the officer listed but not pickable', async () => {
    const { dialog } = setup();
    const waiting = dialog.getByText('Pell Okonru').closest('[role=option]')!;
    expect(waiting).toHaveAttribute('aria-disabled', 'true');
    expect(within(waiting as HTMLElement).getByText('Review waiting')).toBeInTheDocument();
    expect(waiting).toHaveTextContent('Review asked by Ilse Marrow, 2d ago');
    await userEvent.click(waiting);
    expect(dialog.getByRole('combobox')).toBeInTheDocument();
    const you = dialog.getByText('Kestrel Vane').closest('[role=option]')!;
    expect(within(you as HTMLElement).getByText('You')).toBeInTheDocument();
  });

  it('says so before submit when no member matches', async () => {
    const { dialog } = setup();
    await userEvent.type(dialog.getByRole('combobox'), 'Zed');
    expect(dialog.getByText(/No member named .Zed. in the corporation/)).toBeInTheDocument();
    expect(dialog.queryByRole('option')).toBeNull();
  });

  it('falls back to the exact-name field with the reason when the roster is unreadable', async () => {
    const { dialog, onRequest } = setup({ status: 'unreadable' });
    expect(dialog.getByText(/Could not load the member list/)).toBeInTheDocument();
    await userEvent.type(dialog.getByLabelText('Character name, exactly as in game'), 'Sio Tane');
    await userEvent.type(dialog.getByLabelText('Role they are up for'), 'Accountant');
    await userEvent.click(dialog.getByRole('button', { name: 'Ask for a review' }));
    expect(onRequest).toHaveBeenCalledWith('Sio Tane', 'Accountant');
  });
});

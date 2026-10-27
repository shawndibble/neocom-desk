import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PendingGroupingNotice } from './PendingGroupingNotice';

const api = vi.hoisted(() => ({ list: vi.fn(), answer: vi.fn() }));
vi.mock('@/features/corpTaxBook/groupingApi', () => ({
  listPendingGroupings: api.list,
  answerGrouping: api.answer,
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(
    new Map([
      [98000001, 'Brass Meridian'],
      [60, 'Main Pilot'],
    ])
  ),
}));

const characters = [
  { characterId: 60, characterName: 'Main Pilot' },
  { characterId: 61, characterName: 'Quiet Alt' },
];
const pending = { corporationId: 98000001, minerId: 'm-a', mainCharacterId: 60 };

beforeEach(() => {
  api.list.mockReset().mockImplementation(async (id: number) => (id === 61 ? [pending] : []));
  api.answer.mockReset().mockResolvedValue(undefined);
});

describe('PendingGroupingNotice', () => {
  it('renders nothing when no tracked character is being asked', async () => {
    api.list.mockResolvedValue([]);
    const { container } = render(<PendingGroupingNotice characters={characters} />);
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it('asks the character that was added, and confirms as that character', async () => {
    render(<PendingGroupingNotice characters={characters} />);
    expect(
      await screen.findByText(/Brass Meridian grouped Quiet Alt with Main Pilot/)
    ).toBeInTheDocument();
    api.list.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Quiet Alt' }));
    expect(api.answer).toHaveBeenCalledWith(
      61,
      expect.objectContaining({ minerId: 'm-a' }),
      'confirm'
    );
    await waitFor(() => expect(screen.queryByText(/grouped Quiet Alt/)).not.toBeInTheDocument());
  });

  it('declines as that character', async () => {
    render(<PendingGroupingNotice characters={characters} />);
    await userEvent.click(await screen.findByRole('button', { name: 'No, remove it' }));
    expect(api.answer).toHaveBeenCalledWith(
      61,
      expect.objectContaining({ corporationId: 98000001 }),
      'decline'
    );
  });

  it('keeps the question and says so when the answer is not saved', async () => {
    api.answer.mockRejectedValue(new Error('nope'));
    render(<PendingGroupingNotice characters={characters} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm Quiet Alt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save that/);
    expect(screen.getByRole('button', { name: 'Confirm Quiet Alt' })).toBeEnabled();
  });
});

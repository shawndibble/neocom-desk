import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { OfficerVerdict } from '../taxBook/bookClient';
import { TurnOnBook } from './TurnOnBook';

const turnOnBook = vi.fn();
vi.mock('../taxBook/bookClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/bookClient')>()),
  turnOnBook: (...a: unknown[]) => turnOnBook(...a),
}));
const createFeederInvite = vi.fn();
vi.mock('../taxBook/feederClient', async (orig) => ({
  ...(await orig<typeof import('../taxBook/feederClient')>()),
  createFeederInvite: (...a: unknown[]) => createFeederInvite(...a),
}));

const verdict = {
  isCeo: false,
  isDirector: true,
  canEdit: true,
  bookActive: false,
} as OfficerVerdict;

beforeEach(() => {
  turnOnBook.mockReset().mockResolvedValue({});
  createFeederInvite.mockReset();
});

describe('TurnOnBook collecting for others', () => {
  it('retries only the invite when it failed after the book was created', async () => {
    createFeederInvite
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ code: 'abc123DEF456', inviteId: 'i' });
    render(
      <TurnOnBook collect characterId={7} corporationId={98} verdict={verdict} onDone={vi.fn()} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Turn the book on' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Turn the book on' }));
    expect(await screen.findByDisplayValue(/abc123DEF456/)).toBeInTheDocument();
    expect(turnOnBook).toHaveBeenCalledTimes(1);
    expect(createFeederInvite).toHaveBeenCalledTimes(2);
  });
});

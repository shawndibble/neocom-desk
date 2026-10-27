import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That did not go through. Try again.'
    );
    await user.click(screen.getByRole('button', { name: 'Turn the book on' }));
    expect(await screen.findByDisplayValue(/abc123DEF456/)).toBeInTheDocument();
    expect(turnOnBook).toHaveBeenCalledTimes(1);
    expect(createFeederInvite).toHaveBeenCalledTimes(2);
  });

  it('copies the new link', async () => {
    const copied = vi.fn().mockResolvedValue(undefined);
    configureClipboard(copied);
    createFeederInvite.mockResolvedValueOnce({ code: 'abc123DEF456', inviteId: 'i' });
    render(
      <TurnOnBook collect characterId={7} corporationId={98} verdict={verdict} onDone={vi.fn()} />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Turn the book on' }));
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(copied).toHaveBeenCalledWith(expect.stringContaining('invite=abc123DEF456'));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    configureClipboard(null);
  });
});

describe('TurnOnBook own book', () => {
  it('labels the start date as EVE time, defaults to the first of this UTC month, and goes Back', async () => {
    const onBack = vi.fn();
    const onTurnedOn = vi.fn();
    const onDone = vi.fn();
    render(
      <TurnOnBook
        characterId={7}
        corporationId={98}
        verdict={verdict}
        onDone={onDone}
        onBack={onBack}
        onTurnedOn={onTurnedOn}
      />
    );
    const user = userEvent.setup();
    const month = `${new Date().toISOString().slice(0, 8)}01`;
    expect(screen.getByLabelText('Start date (EVE time)')).toHaveValue(month);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Turn the book on' }));
    expect(turnOnBook).toHaveBeenCalledWith(7, 98, month, 10);
    expect(onTurnedOn).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { ShareFittingsPanel } from './ShareFittingsPanel';

const { shareFittings, unshareAllFittings, collectFittingsToShare } = vi.hoisted(() => ({
  shareFittings: vi.fn(),
  unshareAllFittings: vi.fn(),
  collectFittingsToShare: vi.fn(),
}));
vi.mock('./sharedFittings', () => ({ shareFittings, unshareAllFittings }));
vi.mock('./shareAllFittings', () => ({ collectFittingsToShare }));

beforeEach(() => {
  vi.clearAllMocks();
  collectFittingsToShare.mockResolvedValue([{ source: 'saved', key: 'a', name: 'A', code: 'c' }]);
  shareFittings.mockResolvedValue(1);
  unshareAllFittings.mockResolvedValue(undefined);
});

describe('ShareFittingsPanel', () => {
  it('shares every Fitting the Character holds into this Community', async () => {
    render(<ShareFittingsPanel characterId={7} communityId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: /share all my fittings/i }));
    await waitFor(() =>
      expect(shareFittings).toHaveBeenCalledWith(7, 'c1', [
        { source: 'saved', key: 'a', name: 'A', code: 'c' },
      ])
    );
    expect(await screen.findByRole('status')).toHaveTextContent('1');
  });

  it('stops sharing them all', async () => {
    render(<ShareFittingsPanel characterId={7} communityId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: /stop sharing/i }));
    await waitFor(() => expect(unshareAllFittings).toHaveBeenCalledWith(7, 'c1'));
  });

  it('says so when it fails', async () => {
    shareFittings.mockRejectedValue(new Error('offline'));
    render(<ShareFittingsPanel characterId={7} communityId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: /share all my fittings/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/couldn.t/i);
  });
});

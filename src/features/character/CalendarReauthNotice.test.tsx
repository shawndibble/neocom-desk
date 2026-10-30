import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CalendarReauthNotice } from './CalendarReauthNotice';
import { beginGrant } from '@/app/grantAction';

vi.mock('@/app/grantAction', () => ({ beginGrant: vi.fn(async () => {}) }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(beginGrant).mockClear();
});

describe('CalendarReauthNotice', () => {
  it('names the refused sources', () => {
    render(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen']} />);
    expect(screen.getByText(/Some sources need a new login: Mercenary dens/)).toBeInTheDocument();
  });

  it('logs in again for the refused sources only', async () => {
    render(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in again' }));
    expect(beginGrant).toHaveBeenCalledWith(1, ['getCharacterMercenaryDens']);
  });

  it('dismisses for good, per character', async () => {
    const { unmount } = render(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount();

    render(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen']} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    render(<CalendarReauthNotice characterId={2} kinds={['mercenaryDen']} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows a source that was not dismissed', async () => {
    const { rerender } = render(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    rerender(<CalendarReauthNotice characterId={1} kinds={['mercenaryDen', 'orderExpiry']} />);
    expect(screen.getByRole('status')).toHaveTextContent('Market orders');
    expect(screen.getByRole('status')).not.toHaveTextContent('Mercenary dens');
  });
});

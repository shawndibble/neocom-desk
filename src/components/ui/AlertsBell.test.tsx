import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { AlertsBell } from './AlertsBell';
import { AlertsPanelContext, type AlertsPanelState } from './alertsPanelContext';
import { UnreadAlertsContext, type AlertBadge } from './unreadAlertsContext';

function renderBell(
  badge: AlertBadge,
  panel: Partial<AlertsPanelState> = {},
  props: { showWhenEmpty?: boolean } = {}
) {
  const setOpen = vi.fn();
  const state: AlertsPanelState = {
    open: false,
    setOpen,
    renderPanel: ({ variant }) => <p>panel {variant}</p>,
    ...panel,
  };
  render(
    <UnreadAlertsContext.Provider value={badge}>
      <AlertsPanelContext.Provider value={state}>
        <AlertsBell {...props} />
      </AlertsPanelContext.Provider>
    </UnreadAlertsContext.Provider>
  );
  return { setOpen };
}

describe('AlertsBell', () => {
  it('shows the unread count in an accent badge', () => {
    renderBell({ count: 3, danger: false });
    const bell = screen.getByRole('button', { name: 'Alerts, 3 waiting' });
    expect(bell).toHaveTextContent('3');
    expect(screen.getByText('3')).toHaveClass('bg-accent');
  });

  it('turns the badge red and says so when a danger alert waits', () => {
    renderBell({ count: 2, danger: true });
    const bell = screen.getByRole('button', { name: 'Alerts, 2 waiting, one is danger' });
    expect(bell).toBeInTheDocument();
    expect(screen.getByText('2')).toHaveClass('bg-danger');
  });

  it('is always rendered: dim, with no badge, at zero', () => {
    renderBell({ count: 0, danger: false });
    const bell = screen.getByRole('button', { name: 'Alerts, none waiting' });
    expect(bell).toHaveClass('opacity-70');
    expect(bell).not.toHaveTextContent(/\d/);
  });

  describe('on a phone', () => {
    const original = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((media: string) =>
        ({
          media,
          matches: media === PHONE_QUERY,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it('draws nothing at zero, so a header with other icons stays clear', () => {
      renderBell({ count: 0, danger: false });
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('still draws at zero when the header asks for it (the Overview)', () => {
      renderBell({ count: 0, danger: false }, {}, { showWhenEmpty: true });
      expect(screen.getByRole('button', { name: 'Alerts, none waiting' })).toBeInTheDocument();
    });

    it('draws while alerts wait', () => {
      renderBell({ count: 2, danger: false });
      expect(screen.getByRole('button', { name: 'Alerts, 2 waiting' })).toBeInTheDocument();
    });
  });

  it('caps the badge at 99+', () => {
    renderBell({ count: 140, danger: false });
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('opens the panel on press and reports its state', async () => {
    const { setOpen } = renderBell({ count: 1, danger: false });
    const bell = screen.getByRole('button', { name: /Alerts/ });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bell);
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it('draws the injected panel while open', () => {
    renderBell({ count: 1, danger: false }, { open: true });
    expect(screen.getByText('panel popover')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alerts/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { Button } from '@/components/ui';
import { NeedsConnection } from './NeedsConnection';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

function renderAction(onClick: () => void) {
  render(
    <NeedsConnection>
      {(offline) => (
        <Button aria-disabled={offline || undefined} onClick={onClick}>
          Send
        </Button>
      )}
    </NeedsConnection>
  );
}

describe('NeedsConnection', () => {
  it('leaves the action alone while online', async () => {
    const onClick = vi.fn();
    renderAction(onClick);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the action offline, explains why, and enables it again on reconnect', async () => {
    const onClick = vi.fn();
    renderAction(onClick);
    setOnline(false);

    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.hover(button);
    expect((await screen.findAllByText('Needs a connection')).length).toBeGreaterThan(0);

    setOnline(true);
    expect(screen.getByRole('button', { name: 'Send' })).not.toHaveAttribute('aria-disabled');
  });
});

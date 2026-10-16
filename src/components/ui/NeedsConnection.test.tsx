import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { Button } from './Button';
import { NeedsConnection } from './NeedsConnection';

function go(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('NeedsConnection', () => {
  it('leaves the control alone while online', async () => {
    go(true);
    const onClick = vi.fn();
    render(
      <NeedsConnection>
        <Button onClick={onClick}>Log in</Button>
      </NeedsConnection>
    );
    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables a Button while offline, keeps it focusable and names why on hover', async () => {
    go(false);
    const onClick = vi.fn();
    render(
      <NeedsConnection>
        <Button onClick={onClick}>Log in</Button>
      </NeedsConnection>
    );
    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await userEvent.hover(button);
    expect((await screen.findAllByText('Needs a connection')).length).toBeGreaterThan(0);
  });

  it('swallows the press on a raw button, which has no aria-disabled handling of its own', async () => {
    go(false);
    const onClick = vi.fn();
    render(
      <NeedsConnection>
        <button type="button" onClick={onClick}>
          Raw
        </button>
      </NeedsConnection>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('works again as soon as the connection returns', async () => {
    go(false);
    const onClick = vi.fn();
    render(
      <NeedsConnection>
        <Button onClick={onClick}>Log in</Button>
      </NeedsConnection>
    );
    act(() => go(true));
    const button = screen.getByRole('button', { name: 'Log in' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

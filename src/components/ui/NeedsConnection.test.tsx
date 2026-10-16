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

  it('disables a Button while offline, keeps it focusable and names why', async () => {
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
    // Reach it by keyboard: focus opens the reason with no hover timing involved
    // (a click leaves pointer focus, which the tooltip deliberately ignores; the
    // hover path is covered by the tooltip-merge test below).
    act(() => button.blur());
    await userEvent.tab();
    expect(button).toHaveFocus();
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

  it('keeps the same control and its focus across a connectivity change, in both directions', () => {
    go(true);
    render(
      <NeedsConnection>
        <Button>Log in</Button>
      </NeedsConnection>
    );
    const button = screen.getByRole('button', { name: 'Log in' });
    button.focus();
    expect(document.activeElement).toBe(button);

    act(() => go(false));
    expect(screen.getByRole('button', { name: 'Log in' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');

    act(() => go(true));
    expect(screen.getByRole('button', { name: 'Log in' })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('adds the reason under the control’s own tooltip offline, and shows only that tooltip online', async () => {
    go(true);
    render(
      <NeedsConnection tooltip="Add character">
        <Button aria-label="Add character">+</Button>
      </NeedsConnection>
    );
    const button = screen.getByRole('button', { name: 'Add character' });
    await userEvent.hover(button);
    const online = await screen.findByRole('tooltip');
    expect(online).toHaveTextContent('Add character');
    expect(online).not.toHaveTextContent('Needs a connection');
    await userEvent.unhover(button);

    act(() => go(false));
    await userEvent.hover(button);
    const offline = (await screen.findAllByRole('tooltip')).at(-1);
    expect(offline).toHaveTextContent('Add character');
    expect(offline).toHaveTextContent('Needs a connection');
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

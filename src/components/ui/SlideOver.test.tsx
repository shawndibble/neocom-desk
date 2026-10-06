import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SlideOver } from './SlideOver';

describe('SlideOver', () => {
  it('leaves the page behind live: an outside click neither closes it nor is blocked', () => {
    const onClose = vi.fn();
    const onPageClick = vi.fn();
    render(
      <>
        <button type="button" onClick={onPageClick}>
          Page control
        </button>
        <SlideOver open onClose={onClose} title="Add">
          <p>Panel body</p>
        </SlideOver>
      </>
    );
    expect(screen.getByRole('dialog', { name: 'Add' })).toBeTruthy();
    const page = screen.getByRole('button', { name: 'Page control' });
    fireEvent.pointerDown(page);
    fireEvent.click(page);
    expect(onPageClick).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and on its close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SlideOver open onClose={onClose} title="Add">
        <p>Panel body</p>
      </SlideOver>
    );
    // Radix arms its Escape listener shortly after mount, so retry until it takes.
    await waitFor(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
    const afterEscape = onClose.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(afterEscape + 1);
  });
});

describe('SlideOver edge and history', () => {
  it('pads its edge by the safe-area inset', () => {
    render(
      <SlideOver open onClose={() => {}} title="Add">
        <p>Panel body</p>
      </SlideOver>
    );
    expect(screen.getByRole('dialog', { name: 'Add' }).className).toContain(
      'pb-[env(safe-area-inset-bottom)]'
    );
  });

  it('closes on Back', async () => {
    const onClose = vi.fn();
    render(
      <SlideOver open onClose={onClose} title="Add">
        <p>Panel body</p>
      </SlideOver>
    );
    act(() => window.history.back());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('SlideOver focus', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open panel
        </button>
        <SlideOver open={open} onClose={() => setOpen(false)} title="Panel">
          <p>Body</p>
        </SlideOver>
      </>
    );
  }

  it('returns focus to the opener on Escape and on the close button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open panel' });
    opener.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Panel' });
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('opens without focusing Close, so no tooltip eats the first Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('button', { name: 'Open panel' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Panel' });
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

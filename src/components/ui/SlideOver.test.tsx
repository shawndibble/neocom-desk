import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

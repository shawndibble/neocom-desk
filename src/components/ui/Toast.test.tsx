import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { PortalContainerProvider } from './portalContainer';
import { Toast } from './Toast';

describe('Toast', () => {
  it('portals to document.body — not into whatever ancestor renders it', () => {
    const { container } = render(
      <div data-testid="host">
        <Toast message="Copied" />
      </div>
    );
    expect(container.querySelector('[data-testid="host"]')).not.toContainElement(
      screen.getByRole('status')
    );
    expect(document.body).toContainElement(screen.getByRole('status'));
  });

  it("portals into a Modal's container when inside one, so it isn't hidden behind the top layer", () => {
    const modalBody = document.createElement('div');
    document.body.appendChild(modalBody);
    render(
      <PortalContainerProvider value={modalBody}>
        <Toast message="Copied" />
      </PortalContainerProvider>
    );
    expect(modalBody).toContainElement(screen.getByRole('status'));
    modalBody.remove();
  });

  it('replays its rise when a new message replaces the old one in place, so the two read as different toasts', () => {
    const rise = { animationName: 'toast-in', cancel: vi.fn(), play: vi.fn() };
    const other = { animationName: 'something-else', cancel: vi.fn(), play: vi.fn() };
    const spy = vi.fn(() => [rise, other]);
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      value: spy,
      configurable: true,
    });
    try {
      const props = { undo: { label: 'Undo', onUndo: () => {} }, onClose: () => {} };
      const { rerender } = render(<Toast message="Tritanium moved to To buy" {...props} />);
      expect(rise.play).not.toHaveBeenCalled();

      rerender(<Toast message="Pyerite moved to To buy" {...props} />);
      expect(rise.cancel).toHaveBeenCalledTimes(1);
      expect(rise.play).toHaveBeenCalledTimes(1);
      expect(other.play).not.toHaveBeenCalled();

      rerender(<Toast message="Pyerite moved to To buy" {...props} />);
      expect(rise.play).toHaveBeenCalledTimes(1);

      const first = {};
      rerender(<Toast message="Job dismissed" instance={first} {...props} />);
      expect(rise.play).toHaveBeenCalledTimes(2);
      rerender(<Toast message="Job dismissed" instance={first} {...props} />);
      expect(rise.play).toHaveBeenCalledTimes(2);
      rerender(<Toast message="Job dismissed" instance={{}} {...props} />);
      expect(rise.play).toHaveBeenCalledTimes(3);
    } finally {
      delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations;
    }
  });

  it('shows the message and, given undo, a working undo link', () => {
    let undone = false;
    render(
      <Toast
        message="Item removed"
        undo={{ label: 'Undo', onUndo: () => (undone = true) }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Item removed')).toBeVisible();
    screen.getByRole('button', { name: 'Undo' }).click();
    expect(undone).toBe(true);
  });

  describe('tone', () => {
    afterEach(() => vi.useRealTimers());

    const toastBox = () => screen.getByText('Saved').parentElement!;

    it('leaves an untoned toast neutral, with no glyph and no spoken tone', () => {
      vi.useFakeTimers();
      render(<Toast message="Saved" />);
      expect(toastBox()).toHaveClass('border-line-bright');
      expect(toastBox().querySelector('svg')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent(/^Saved$/);
    });

    it('tints the border, draws the glyph and speaks the word for success', () => {
      vi.useFakeTimers();
      render(<Toast message="Saved" tone="success" />);
      const box = toastBox();
      expect(box).toHaveClass('border-success');
      expect(box).not.toHaveClass('border-line-bright');
      const glyph = box.querySelector('svg');
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Success: Saved');
    });

    it('tints the border, draws the glyph and speaks the word for danger', () => {
      vi.useFakeTimers();
      render(<Toast message="Saved" tone="danger" />);
      expect(toastBox()).toHaveClass('border-danger');
      expect(toastBox().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Error: Saved');
    });
  });

  describe('announcement', () => {
    afterEach(() => vi.useRealTimers());

    it('hides the visible message from AT and announces it through an initially empty live region', () => {
      vi.useFakeTimers();
      render(<Toast message="Copied" />);
      expect(screen.getByText('Copied')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Copied');
    });
  });

  it('announces a new instance again even when its text is the same', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Toast message="Job dismissed" instance={{}} />);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Job dismissed');
      rerender(<Toast message="Job dismissed" instance={{}} />);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Job dismissed');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('persistence and dismissal', () => {
    afterEach(() => vi.useRealTimers());

    it('plays its exit before closing on expiry, while the close button stays instant', async () => {
      vi.useFakeTimers();
      let finish = () => {};
      const exit = {
        animationName: 'toast-out',
        finished: new Promise<void>((resolve) => (finish = resolve)),
      };
      Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
        value: function (this: HTMLElement) {
          return this.classList.contains('toast-out') ? [exit] : [];
        },
        configurable: true,
      });
      try {
        const onClose = vi.fn();
        render(
          <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
        );
        act(() => {
          vi.advanceTimersByTime(8_000);
        });
        expect(onClose).not.toHaveBeenCalled();
        await act(async () => finish());
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        expect(onClose).toHaveBeenCalledTimes(2);
      } finally {
        delete (HTMLElement.prototype as { getAnimations?: unknown }).getAnimations;
      }
    });

    it('closes an undo toast after 8s, and sooner from the close button', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
      );
      act(() => {
        vi.advanceTimersByTime(7_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('holds the undo clock while hovered and resumes with the time left', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
      );
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      fireEvent.focus(screen.getByRole('button', { name: /undo/i }));
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.blur(screen.getByRole('button', { name: /undo/i }));
      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps an action-only toast past the plain timer', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Toast message="Saved" action={{ label: 'Open', onAction: () => {} }} onClose={onClose} />
      );
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('expires a plain toast that was given onClose, and shows no close button', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(<Toast message="Copied" onClose={onClose} />);
      expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
      act(() => {
        vi.advanceTimersByTime(7_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('restarts the clock for a new instance with the same text', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      const { rerender } = render(<Toast message="Copied" instance={{}} onClose={onClose} />);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      rerender(<Toast message="Copied" instance={{}} onClose={onClose} />);
      act(() => {
        vi.advanceTimersByTime(7_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('holds the remaining time while hovered and resumes after', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(<Toast message="Copied" onClose={onClose} />);
      const toast = screen.getByText('Copied').parentElement!;
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      fireEvent.pointerEnter(toast, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.pointerLeave(toast, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Alt+Z moves focus onto Undo from anywhere, and Escape hands it back', () => {
      const onClose = vi.fn();
      render(
        <>
          <button type="button">Page</button>
          <Toast message="Removed" undo={{ label: 'Undo', onUndo: vi.fn() }} onClose={onClose} />
        </>
      );
      const page = screen.getByRole('button', { name: 'Page' });
      page.focus();
      fireEvent.keyDown(page, { key: 'z', code: 'KeyZ', altKey: true });
      const undo = screen.getByRole('button', { name: 'Undo' });
      expect(undo).toHaveFocus();
      expect(undo).toHaveAttribute('aria-keyshortcuts', 'Alt+Z');
      fireEvent.keyDown(undo, { key: 'Escape' });
      expect(page).toHaveFocus();
    });

    it('closes on Escape and returns focus to where it came from', () => {
      const onClose = vi.fn();
      render(
        <>
          <button type="button">Origin</button>
          <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
        </>
      );
      const origin = screen.getByRole('button', { name: 'Origin' });
      origin.focus();
      const undo = screen.getByRole('button', { name: /undo/i });
      fireEvent.focus(undo, { relatedTarget: origin });
      undo.focus();
      fireEvent.keyDown(undo, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(origin).toHaveFocus();
    });

    it('closes an action toast on a route change', () => {
      const onClose = vi.fn();
      function Go() {
        const navigate = useNavigate();
        return (
          <button type="button" onClick={() => navigate('/next')}>
            Go
          </button>
        );
      }
      render(
        <MemoryRouter>
          <Go />
          <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
        </MemoryRouter>
      );
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

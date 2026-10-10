import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('persistence and dismissal', () => {
    afterEach(() => vi.useRealTimers());

    it('keeps an undo toast past the plain timer and closes it from the close button', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(
        <Toast message="Added" undo={{ label: 'Undo', onUndo: () => {} }} onClose={onClose} />
      );
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
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

    it('holds the remaining time while hovered and resumes after', () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      render(<Toast message="Copied" onClose={onClose} />);
      const toast = screen.getByText('Copied').parentElement!;
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      fireEvent.mouseEnter(toast);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.mouseLeave(toast);
      act(() => {
        vi.advanceTimersByTime(2_999);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
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

import { act, render, screen } from '@testing-library/react';
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
      <Toast message="Item removed" undo={{ label: 'Undo', onUndo: () => (undone = true) }} />
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
});

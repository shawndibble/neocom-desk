import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { IskAmount } from './IskAmount';
import { MenuItem, RowActionsMenu } from './RowActions';

const EXACT = '1,284,500,000.00 ISK';

/** The focusable trigger — the shorthand on screen, the exact figure in hidden text inside it. */
function trigger(exact = EXACT) {
  return screen.getByText(exact, { selector: '.sr-only' }).parentElement as HTMLElement;
}

describe('IskAmount', () => {
  it('renders the value in shorthand', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(screen.getByText('1.3B')).toBeInTheDocument();
  });

  it('reads the shorthand and then the exact value as text, with no gesture', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(trigger()).toHaveTextContent(`1.3B ${EXACT}`);
    expect(trigger()).not.toHaveAttribute('aria-hidden');
    expect(screen.getByText(EXACT)).toHaveClass('sr-only');
  });

  it('carries no aria-label, which a role-less span may not have', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(trigger()).not.toHaveAttribute('aria-label');
  });

  it('stays a tab stop, so the tooltip is reachable from the keyboard', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(trigger()).toHaveAttribute('tabindex', '0');
  });

  it('reveals the exact value on hover', async () => {
    const user = userEvent.setup();
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    await user.hover(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('reveals the exact value on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('reveals on a plain tap where the figure is inert', async () => {
    render(<IskAmount value={1_284_500_000} revealOn="tap" />);
    const target = trigger();
    fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(target, { touches: [] });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('leaves the tap alone where the tap already acts, so long press reveals instead', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    const target = trigger();
    fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(target, { touches: [] });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not swallow a click that belongs to the row underneath', async () => {
    const user = userEvent.setup();
    let rowClicks = 0;
    render(
      <button type="button" onClick={() => (rowClicks += 1)}>
        <IskAmount value={5_000_000} revealOn="longPress" />
      </button>
    );
    await user.click(screen.getByText('5M'));
    expect(rowClicks).toBe(1);
  });

  it('honours the caller precision for the exact value', () => {
    render(<IskAmount value={1_284_500_000} decimals={0} revealOn="longPress" />);
    expect(trigger('1,284,500,000 ISK')).toHaveTextContent('1.3B 1,284,500,000 ISK');
  });
});

describe('IskAmount inside a row menu', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function inRow() {
    render(
      <RowActionsMenu name="Order" items={<MenuItem>Cancel order</MenuItem>}>
        <div>
          <IskAmount value={1_284_500_000} revealOn="longPress" />
        </div>
      </RowActionsMenu>
    );
  }

  it('keeps its own touch-and-hold: the exact figure shows, and the row menu stays shut', () => {
    vi.useFakeTimers();
    inRow();
    fireEvent.pointerDown(trigger(), { pointerType: 'touch' });
    fireEvent.touchStart(trigger());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent(EXACT);
    expect(screen.queryByRole('menuitem', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('still lets a right-click on the figure open the row menu', () => {
    inRow();
    fireEvent.pointerDown(trigger(), { pointerType: 'mouse', button: 2 });
    fireEvent.contextMenu(trigger());
    expect(screen.getByRole('menuitem', { name: 'Cancel order' })).toBeInTheDocument();
  });
});

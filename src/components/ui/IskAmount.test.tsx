import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { IskAmount } from './IskAmount';
import { MenuItem, RowActionsMenu } from './RowActions';
import { RowTappableContext } from './tooltipHold';

const EXACT = '1,284,500,000.00 ISK';

/** The focusable trigger — the shorthand on screen, the exact figure in hidden text inside it. */
function trigger(exact = EXACT) {
  return screen.getByText(exact, { selector: '.sr-only' }).parentElement as HTMLElement;
}

describe('IskAmount', () => {
  it('renders the value in shorthand', () => {
    render(<IskAmount value={1_284_500_000} />);
    expect(screen.getByText('1.3B')).toBeInTheDocument();
  });

  it('reads the shorthand and then the exact value as text, with no gesture', () => {
    render(<IskAmount value={1_284_500_000} />);
    expect(trigger()).toHaveTextContent(`1.3B ${EXACT}`);
    expect(trigger()).not.toHaveAttribute('aria-hidden');
    expect(screen.getByText(EXACT)).toHaveClass('sr-only');
  });

  it('carries no aria-label, which a role-less span may not have', () => {
    render(<IskAmount value={1_284_500_000} />);
    expect(trigger()).not.toHaveAttribute('aria-label');
  });

  it('stays a tab stop, so the tooltip is reachable from the keyboard', () => {
    render(<IskAmount value={1_284_500_000} />);
    expect(trigger()).toHaveAttribute('tabindex', '0');
  });

  it('reveals the exact value on hover', async () => {
    const user = userEvent.setup();
    render(<IskAmount value={1_284_500_000} />);
    await user.hover(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('reveals the exact value on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<IskAmount value={1_284_500_000} />);
    await user.tab();
    expect(trigger()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('reveals on a plain tap', async () => {
    render(<IskAmount value={1_284_500_000} />);
    const target = trigger();
    fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(target, { touches: [] });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('never reveals on a touch-and-hold: a tap does the job, and in a row the hold is the menu', () => {
    vi.useFakeTimers();
    render(<IskAmount value={1_284_500_000} />);
    fireEvent.touchStart(trigger(), { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('in a tappable row leaves the tap to the row instead of toggling its bubble', () => {
    render(
      <RowTappableContext.Provider value>
        <IskAmount value={1_284_500_000} />
      </RowTappableContext.Provider>
    );
    const target = trigger();
    expect(target).not.toHaveAttribute('data-row-control');
    fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(target, { touches: [] });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('in a tappable row still reveals on hover', async () => {
    const user = userEvent.setup();
    render(
      <RowTappableContext.Provider value>
        <IskAmount value={1_284_500_000} />
      </RowTappableContext.Provider>
    );
    await user.hover(trigger());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXACT);
  });

  it('outside a tappable row marks itself a row control, so its tap does not open the row', () => {
    render(<IskAmount value={1_284_500_000} />);
    expect(trigger()).toHaveAttribute('data-row-control');
  });

  it('honours the caller precision for the exact value', () => {
    render(<IskAmount value={1_284_500_000} decimals={0} />);
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
          <IskAmount value={1_284_500_000} />
        </div>
      </RowActionsMenu>
    );
  }

  it('a touch-and-hold opens the row menu and never a tooltip', () => {
    vi.useFakeTimers();
    inRow();
    fireEvent.pointerDown(trigger(), { pointerType: 'touch' });
    fireEvent.touchStart(trigger());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('still lets a right-click on the figure open the row menu', () => {
    inRow();
    fireEvent.pointerDown(trigger(), { pointerType: 'mouse', button: 2 });
    fireEvent.contextMenu(trigger());
    expect(screen.getByRole('menuitem', { name: 'Cancel order' })).toBeInTheDocument();
  });
});

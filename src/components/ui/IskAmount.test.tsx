import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { IskAmount } from './IskAmount';

const EXACT = '1,284,500,000.00 ISK';

/** The focusable trigger — named by the exact figure, showing the shorthand. */
function trigger(exact = EXACT) {
  return screen.getByLabelText(exact);
}

describe('IskAmount', () => {
  it('renders the value in shorthand', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(screen.getByText('1.3B')).toBeInTheDocument();
  });

  it('keeps the exact value in the accessible name, with no gesture', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(trigger()).toHaveAccessibleName(EXACT);
  });

  it('hides the shorthand from screen readers, so the value is announced once', () => {
    render(<IskAmount value={1_284_500_000} revealOn="longPress" />);
    expect(screen.getByText('1.3B')).toHaveAttribute('aria-hidden', 'true');
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
    expect(trigger('1,284,500,000 ISK')).toHaveAccessibleName('1,284,500,000 ISK');
  });
});

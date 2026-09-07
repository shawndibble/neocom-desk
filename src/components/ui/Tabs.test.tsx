import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'open', label: 'Open' },
  { id: 'history', label: 'History' },
];

describe('Tabs', () => {
  it('marks the active tab selected', () => {
    render(<Tabs tabs={tabs} value="history" onChange={() => undefined} label="Orders" />);
    expect(screen.getByRole('tablist', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange on click', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="open" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(onChange).toHaveBeenCalledWith('history');
  });

  /**
   * The bar scrolls sideways once it outgrows its frame, so a tab selected
   * from outside this component — a deep link opening a specific tab — can
   * start off-screen. jsdom does no layout, so what is asserted is that the
   * newly selected tab is the one asked to scroll, and that it is asked with
   * `block: 'nearest'`: the default would scroll the page vertically to put
   * the tab bar at the top, which changing a tab never asked for.
   */
  it('scrolls the selected tab into view when the selection changes', () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);

    const { rerender } = render(<Tabs tabs={tabs} value="open" onChange={() => undefined} />);
    expect(scrollIntoView.mock.instances.at(-1)).toBe(screen.getByRole('tab', { name: 'Open' }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });

    rerender(<Tabs tabs={tabs} value="history" onChange={() => undefined} />);
    expect(scrollIntoView.mock.instances.at(-1)).toBe(screen.getByRole('tab', { name: 'History' }));

    scrollIntoView.mockRestore();
  });

  it('moves selection with arrow keys, wrapping', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="open" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Open' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('history');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('history');
  });
});

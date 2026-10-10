import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabPanel, Tabs } from './Tabs';

const tabs = [
  { id: 'open', label: 'Open' },
  { id: 'history', label: 'History' },
];

describe('Tabs', () => {
  it('marks the active tab selected', () => {
    render(
      <Tabs tabsId="t" tabs={tabs} value="history" onChange={() => undefined} label="Orders" />
    );
    expect(screen.getByRole('tablist', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onChange on click', async () => {
    const onChange = vi.fn();
    render(<Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={onChange} />);
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

    const { rerender } = render(
      <Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={() => undefined} />
    );
    expect(scrollIntoView.mock.instances.at(-1)).toBe(screen.getByRole('tab', { name: 'Open' }));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });

    rerender(
      <Tabs tabsId="t" label="Orders" tabs={tabs} value="history" onChange={() => undefined} />
    );
    expect(scrollIntoView.mock.instances.at(-1)).toBe(screen.getByRole('tab', { name: 'History' }));

    scrollIntoView.mockRestore();
  });

  it('moves selection with arrow keys, wrapping', async () => {
    const onChange = vi.fn();
    render(<Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={onChange} />);
    screen.getByRole('tab', { name: 'Open' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('history');
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('history');
  });

  /**
   * `activation="manual"` is for a caller whose `onChange` navigates to
   * another route (Industry's plan/group pages) rather than swapping content
   * this component keeps mounted. An arrow key there must only move the
   * roving tab stop — calling `onChange` on every arrow press would unmount
   * this whole tablist mid-keypress and strand focus on `document.body`.
   */
  describe('activation="manual"', () => {
    it('moves focus without selecting on arrow keys, then selects on Enter', async () => {
      const onChange = vi.fn();
      render(
        <Tabs
          tabsId="t"
          label="Orders"
          tabs={tabs}
          value="open"
          onChange={onChange}
          activation="manual"
        />
      );

      screen.getByRole('tab', { name: 'Open' }).focus();
      await userEvent.keyboard('{ArrowRight}');
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('tab', { name: 'History' })).toHaveFocus();

      await userEvent.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith('history');
    });

    it('still selects immediately on click', async () => {
      const onChange = vi.fn();
      render(
        <Tabs
          tabsId="t"
          label="Orders"
          tabs={tabs}
          value="open"
          onChange={onChange}
          activation="manual"
        />
      );
      await userEvent.click(screen.getByRole('tab', { name: 'History' }));
      expect(onChange).toHaveBeenCalledWith('history');
    });
  });

  describe('panel linkage', () => {
    it('links the selected tab to its panel and names the panel from the tab', () => {
      render(
        <>
          <Tabs tabsId="t" tabs={tabs} value="history" onChange={() => undefined} label="Orders" />
          <TabPanel tabsId="t" tabId="history">
            body
          </TabPanel>
        </>
      );
      const tab = screen.getByRole('tab', { name: 'History' });
      const panel = screen.getByRole('tabpanel', { name: 'History' });
      expect(tab.id).not.toBe('');
      expect(tab).toHaveAttribute('aria-controls', panel.id);
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
      expect(panel).toHaveAttribute('tabindex', '0');
    });

    it('gives only the selected tab aria-controls', () => {
      render(
        <Tabs tabsId="t" tabs={tabs} value="open" onChange={() => undefined} label="Orders" />
      );
      expect(screen.getByRole('tab', { name: 'Open' })).toHaveAttribute('aria-controls');
      expect(screen.getByRole('tab', { name: 'History' })).not.toHaveAttribute('aria-controls');
    });
  });
});

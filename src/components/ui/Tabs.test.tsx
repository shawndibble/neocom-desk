import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubAnimate } from '@/test/animate';
import { TabPanel, Tabs } from './Tabs';
import { useTabPanelProps } from './tabPanel';

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

  it('names a counted tab with its count', () => {
    render(
      <Tabs
        tabsId="t"
        label="Community"
        tabs={[...tabs, { id: 'members', label: 'Members', count: 12 }]}
        value="open"
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole('tab', { name: 'Members 12' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Open' })).toBeInTheDocument();
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
   * start off-screen. Bringing it back must only slide the bar: a bar below
   * the fold (the landing page's feature tabs) once dragged the whole page
   * down to it on load. jsdom does no layout, so the rects are stubbed.
   */
  describe('keeping the selected tab in view', () => {
    afterEach(() => vi.restoreAllMocks());

    function stubRect(element: Element, left: number, right: number) {
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        left,
        right,
        top: 0,
        bottom: 0,
        width: right - left,
        height: 0,
        x: left,
        y: 0,
        toJSON: () => ({}),
      });
    }

    /** Lays the bar out at 0–100px with 24px edge padding, then selects `to` at the given rect. */
    function selectOffscreen(to: string, left: number, right: number, scrollLeft = 0) {
      const { rerender } = render(
        <Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={() => undefined} />
      );
      const scroller = screen.getByRole('tablist').parentElement!;
      // The edge fade's clearance (`.tab-scroller` in index.css); jsdom
      // computes only the longhands.
      scroller.style.scrollPaddingLeft = '24px';
      scroller.style.scrollPaddingRight = '24px';
      scroller.scrollLeft = scrollLeft;
      stubRect(scroller, 0, 100);
      stubRect(screen.getByRole('tab', { name: to }), left, right);
      rerender(
        <Tabs
          tabsId="t"
          label="Orders"
          tabs={tabs}
          value={to.toLowerCase()}
          onChange={() => undefined}
        />
      );
      return scroller;
    }

    it('slides the bar, not the page, to a tab past its right edge', () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

      const scroller = selectOffscreen('History', 120, 180);

      // 180 − (100 − 24): the tab's right edge stops clear of the fade.
      expect(scroller.scrollLeft).toBe(104);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('slides the bar back to a tab past its left edge', () => {
      const scroller = selectOffscreen('History', -50, 10, 200);
      // 200 − (24 − (−50)).
      expect(scroller.scrollLeft).toBe(126);
    });
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

  describe('switching tabs', () => {
    let stub: ReturnType<typeof stubAnimate>;
    beforeEach(() => {
      stub = stubAnimate();
    });
    afterEach(() => stub.restore());

    it('fades the panel in as it appears and on each switch', () => {
      const { rerender } = render(
        <TabPanel tabsId="t" tabId="open">
          open body
        </TabPanel>
      );
      expect(stub.animate).toHaveBeenCalledTimes(1);
      rerender(
        <TabPanel tabsId="t" tabId="history">
          history body
        </TabPanel>
      );
      expect(stub.animate).toHaveBeenCalledTimes(2);
      expect(stub.animate.mock.contexts[1]).toBe(screen.getByRole('tabpanel'));
    });

    it('rises the panel into place, so the switch reads as one', () => {
      render(
        <TabPanel tabsId="t" tabId="open">
          open body
        </TabPanel>
      );
      expect(stub.animate).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ translate: '0 8px' })]),
        expect.anything()
      );
    });
  });

  it('animates a bar-less panel without naming a tab that is not there', () => {
    const stub = stubAnimate();
    function Bare() {
      const { className, ...props } = useTabPanelProps(null, 'only');
      return (
        <div {...props} className={className}>
          only view
        </div>
      );
    }
    render(<Bare />);
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(stub.animate.mock.contexts[0]).toBe(screen.getByText('only view'));
    stub.restore();
  });

  describe('preloading a tab the pilot is about to pick', () => {
    function renderBar(onPreload: (id: string) => void) {
      render(
        <Tabs
          tabsId="t"
          tabs={tabs}
          value="open"
          onChange={() => undefined}
          onPreload={onPreload}
          label="Orders"
        />
      );
      return screen.getByRole('tab', { name: 'History' });
    }

    it('preloads on mouse hover', () => {
      const onPreload = vi.fn();
      fireEvent.pointerEnter(renderBar(onPreload), { pointerType: 'mouse' });
      expect(onPreload).toHaveBeenCalledWith('history');
    });

    it('preloads on keyboard focus', () => {
      const onPreload = vi.fn();
      fireEvent.focus(renderBar(onPreload));
      expect(onPreload).toHaveBeenCalledWith('history');
    });

    it('waits for the tap on touch, where hover is the tap itself', () => {
      const onPreload = vi.fn();
      fireEvent.pointerEnter(renderBar(onPreload), { pointerType: 'touch' });
      expect(onPreload).not.toHaveBeenCalled();
    });
  });

  /**
   * A pointer user has no swipe: a vertical wheel travels the bar and a
   * chevron appears at whichever end still has tabs beyond it. jsdom does no
   * layout, so the bar's widths are stubbed on the prototype.
   */
  describe('travelling an overflowing bar with a pointer', () => {
    afterEach(() => {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
      delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    });

    function renderOverflowing() {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        value: 400,
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        value: 700,
      });
      render(
        <Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={() => undefined} />
      );
      return screen.getByRole('tablist').parentElement!;
    }

    // The chevrons are aria-hidden and out of the tab order, so they are found by their glyph's button.
    const chevrons = () => document.querySelectorAll<HTMLButtonElement>('button[aria-hidden]');

    it('draws no chevron for a bar that fits', () => {
      render(
        <Tabs tabsId="t" label="Orders" tabs={tabs} value="open" onChange={() => undefined} />
      );
      expect(chevrons()).toHaveLength(0);
    });

    it('draws only the forward chevron at rest, and both once scrolled', () => {
      const scroller = renderOverflowing();
      expect(chevrons()).toHaveLength(1);
      scroller.scrollLeft = 100;
      act(() => {
        fireEvent.scroll(scroller);
      });
      expect(chevrons()).toHaveLength(2);
    });

    it('pages the bar when a chevron is clicked', () => {
      const scroller = renderOverflowing();
      const scrollBy = vi.fn();
      scroller.scrollBy = scrollBy;
      fireEvent.click(chevrons()[0]);
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 300 }));
    });

    it('turns a vertical wheel into sideways travel and keeps the page still', () => {
      const scroller = renderOverflowing();
      const notPrevented = fireEvent.wheel(scroller, { deltaY: 120 });
      expect(notPrevented).toBe(false);
      expect(scroller.scrollLeft).toBe(120);
    });

    it('hands the wheel back to the page at the start of the bar', () => {
      const scroller = renderOverflowing();
      const notPrevented = fireEvent.wheel(scroller, { deltaY: -120 });
      expect(notPrevented).toBe(true);
      expect(scroller.scrollLeft).toBe(0);
    });
  });
});

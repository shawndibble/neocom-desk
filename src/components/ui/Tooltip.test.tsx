import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, InfoTooltip } from './Tooltip';
import { Modal } from './Modal';

describe('Tooltip', () => {
  /**
   * `Modal` runs on `showModal()`, so the dialog sits in the browser's top
   * layer, which no `z-index` can reach. A bubble portalled to `document.body`
   * — Radix's default — renders *behind* the modal that triggered it, which is
   * why `Tooltip` reads a container off `portalContainer.ts`.
   */
  it('portals its bubble inside a Modal, not to the body', async () => {
    render(
      <Modal open onClose={() => {}} title="Order detail">
        <Tooltip content="One-line explanation.">
          <button type="button">Trigger</button>
        </Tooltip>
      </Modal>
    );

    fireEvent.pointerMove(screen.getByRole('button', { name: 'Trigger' }));

    const dialog = screen.getByRole('dialog', { name: 'Order detail' });
    expect(dialog).toContainElement(await screen.findByRole('tooltip'));
  });

  it('reveals a role="tooltip" bubble on hover, wired to its trigger via aria-describedby', async () => {
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.pointerMove(trigger);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('One-line explanation.');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('reveals the tooltip on keyboard focus too, with no hover delay', () => {
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('One-line explanation.');
  });

  it('sizes the bubble to its content, capped — short text gets no dead space', async () => {
    render(
      <Tooltip content="Delete">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Trigger' }));

    // Only a cap, never a fixed width: Radix's popper wrapper shrink-wraps
    // the bubble, so `w-56` was what padded "Delete" out to 14rem.
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.className).toContain('max-w-56');
    expect(tooltip.className).not.toMatch(/(^|\s)w-\d/);
  });

  it('merges a caller-supplied className onto the trigger element', () => {
    render(
      <Tooltip content="One-line explanation." className="w-full">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    expect(trigger.className).toContain('w-full');
  });
});

describe('Tooltip touch support', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the tooltip after a ~500ms touch-and-hold', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('One-line explanation.');
  });

  it('does not reveal the tooltip on a quick tap, and does not block the trigger tap action', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button" onClick={onClick}>
          Trigger
        </button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.touchEnd(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('dismisses when tapping outside the trigger/tooltip', () => {
    vi.useFakeTimers();
    render(
      <div>
        <Tooltip content="One-line explanation.">
          <button type="button">Trigger</button>
        </Tooltip>
        <button type="button">Outside</button>
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const outside = screen.getByRole('button', { name: 'Outside' });

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // Radix's DismissableLayer defers attaching its outside-pointerdown
    // listener by a setTimeout(0), so it never mistakes the pointerdown that
    // opened the layer for one that should close it — flush that tick first.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps a long-press-revealed tooltip up until something dismisses it, with no timeout', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.touchEnd(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // Reading time is the reader's — only an explicit dismissal closes it.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('still reveals when the finger only drifts a pixel or two during the hold', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(trigger, { touches: [{ clientX: 103, clientY: 102 }] });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('drops a pending long press when the browser cancels the touch', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    fireEvent.touchCancel(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('cancels the reveal once the finger really drags, so a scroll is not a long press', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(trigger, { touches: [{ clientX: 100, clientY: 160 }] });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Tooltip tap-to-open', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals on a plain tap, with no hold, when openOnTap is set', () => {
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);

    expect(screen.getByRole('tooltip')).toHaveTextContent('One-line explanation.');
  });

  it('hides again on the next tap of the same trigger', () => {
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    vi.useFakeTimers();
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // The real event order on a touch device: `pointerdown` lands first, and
    // Radix dismisses the bubble on it. The second tap still has to read as
    // "close", not re-open.
    act(() => {
      vi.advanceTimersByTime(0); // let DismissableLayer attach its outside listener
    });
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes on Escape, so a timeout-free bubble is still dismissable', () => {
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not reveal when the browser cancels the touch, e.g. to scroll', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    fireEvent.touchCancel(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not reveal when the touch was a drag rather than a tap', () => {
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(trigger, { touches: [{ clientX: 100, clientY: 160 }] });
    fireEvent.touchEnd(trigger);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Tooltip multi-touch', () => {
  it('ignores a second finger instead of reading it as a tap on the trigger', () => {
    render(
      <Tooltip content="One-line explanation." openOnTap>
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchStart(trigger, {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 200 },
      ],
    });
    // First finger lifts, second still down — not a completed tap.
    fireEvent.touchEnd(trigger, { touches: [{ clientX: 200, clientY: 200 }] });

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('InfoTooltip', () => {
  it('renders a labeled "?" button describing the tooltip content once revealed', () => {
    render(<InfoTooltip label="About Material Efficiency" content="Reduces material use." />);
    const trigger = screen.getByRole('button', { name: 'About Material Efficiency' });

    fireEvent.focus(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Reduces material use.');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('reveals its tooltip on a single tap — an explain-only icon needs no hold', () => {
    render(<InfoTooltip label="About Material Efficiency" content="Reduces material use." />);
    const trigger = screen.getByRole('button', { name: 'About Material Efficiency' });

    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);

    expect(screen.getByRole('tooltip')).toHaveTextContent('Reduces material use.');
  });

  it('gives the tap back to the click action when it has one, keeping long-press for the tooltip', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <InfoTooltip
        label="About Material Efficiency"
        content="Reduces material use."
        onClick={onClick}
        aria-haspopup="dialog"
      />
    );
    const trigger = screen.getByRole('button', { name: 'About Material Efficiency' });

    fireEvent.touchStart(trigger);
    fireEvent.touchEnd(trigger);
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reduces material use.');
    vi.useRealTimers();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, InfoTooltip } from './Tooltip';

describe('Tooltip', () => {
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

  it('dismisses on its own a short while after a long-press reveal', () => {
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
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
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

  it('resets the auto-dismiss window on a second long-press, instead of closing on the first one’s stale timer', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500); // t=500: revealed, first auto-dismiss would fire at t=2000
    });
    fireEvent.touchEnd(trigger);

    act(() => {
      vi.advanceTimersByTime(500); // t=1000
    });
    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500); // t=1500: second reveal, resets auto-dismiss to fire at t=3000
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500); // t=2000: first press's stale timer must not fire here
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000); // t=3000: second press's own auto-dismiss fires
    });
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
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, InfoTooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders a role="tooltip" bubble wired to its trigger via aria-describedby', () => {
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('One-line explanation.');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
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
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('hidden');

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(tooltip.className).not.toContain('hidden');
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
    const tooltip = screen.getByRole('tooltip');

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.touchEnd(trigger);
    fireEvent.click(trigger);

    expect(tooltip.className).toContain('hidden');
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
    const tooltip = screen.getByRole('tooltip');

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(tooltip.className).not.toContain('hidden');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(tooltip.className).toContain('hidden');
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
    const tooltip = screen.getByRole('tooltip');

    fireEvent.touchStart(trigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(tooltip.className).not.toContain('hidden');

    fireEvent.pointerDown(outside);
    expect(tooltip.className).toContain('hidden');
  });

  it('resets the auto-dismiss window on a second long-press, instead of closing on the first one’s stale timer', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="One-line explanation.">
        <button type="button">Trigger</button>
      </Tooltip>
    );
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const tooltip = screen.getByRole('tooltip');

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
    expect(tooltip.className).not.toContain('hidden');

    act(() => {
      vi.advanceTimersByTime(500); // t=2000: first press's stale timer must not fire here
    });
    expect(tooltip.className).not.toContain('hidden');

    act(() => {
      vi.advanceTimersByTime(1000); // t=3000: second press's own auto-dismiss fires
    });
    expect(tooltip.className).toContain('hidden');
  });
});

describe('InfoTooltip', () => {
  it('renders a labeled "?" button describing the tooltip content', () => {
    render(<InfoTooltip label="About Material Efficiency" content="Reduces material use." />);
    const trigger = screen.getByRole('button', { name: 'About Material Efficiency' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Reduces material use.');
    expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
  });
});

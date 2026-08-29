import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAgeBadge } from './DataAgeBadge';

const NOW = new Date('2026-08-29T12:00:00Z');

describe('DataAgeBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "just now" under a minute', () => {
    render(<DataAgeBadge date={new Date(NOW.getTime() - 30_000)} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it.each([
    [5 * 60_000, '5m ago', 'text-text-dim'],
    [3 * 3_600_000, '3h ago', 'text-warning'],
    [2 * 86_400_000, '2d ago', 'text-danger'],
  ])('renders %#: %s with stale tone', (ageMs, text, tone) => {
    render(<DataAgeBadge date={new Date(NOW.getTime() - ageMs)} />);
    const badge = screen.getByText(text);
    expect(badge.className).toContain(tone);
  });

  it('exposes the absolute timestamp', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} />);
    expect(screen.getByText('5m ago')).toHaveAttribute('dateTime', date.toISOString());
  });
});

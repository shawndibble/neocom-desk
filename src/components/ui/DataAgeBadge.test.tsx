import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { DataAgeBadge } from './DataAgeBadge';
import { formatTimestamp } from '@/lib/timestamp';

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

  it('is hidden below the md breakpoint — mobile gets the age from Settings’ Data Age tab instead', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} />);
    expect(screen.getByText('5m ago').className).toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(screen.getByText('5m ago').className).toContain('md:inline-flex');
  });

  it('alwaysVisible shows the badge below md too, keeping the tone', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} alwaysVisible />);
    const cls = screen.getByText('5m ago').className;
    expect(cls).not.toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(cls).toContain('inline-flex');
    expect(cls).toContain('text-text-dim');
  });

  it('says nothing beyond the timestamp when no note is given', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} />);
    const badge = screen.getByText('5m ago');
    expect(badge).not.toHaveAttribute('title');
    fireEvent.focus(badge);
    expect(screen.getByRole('tooltip')).toHaveTextContent(formatTimestamp(date));
  });

  it('is a keyboard stop, since a tooltip needs a focusable trigger', () => {
    render(<DataAgeBadge date={new Date(NOW.getTime() - 5 * 60_000)} />);
    expect(screen.getByText('5m ago')).toHaveAttribute('tabindex', '0');
  });

  it('tooltip={false} is plain text: no tooltip, no tab stop, no title (for use inside a button)', () => {
    render(<DataAgeBadge date={new Date(NOW.getTime() - 5 * 60_000)} tooltip={false} />);
    const badge = screen.getByText('5m ago');
    expect(badge).not.toHaveAttribute('tabindex');
    expect(badge).not.toHaveAttribute('title');
    fireEvent.focus(badge);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  /**
   * For a view whose source refreshes on a cadence of its own — corp data is
   * cached by CCP for about an hour — the age alone would leave the amber tone
   * reading as a fault rather than as normal.
   */
  it('appends a view’s own refresh cadence to the tooltip when given one', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} note="Corp data refreshes about hourly." />);
    fireEvent.focus(screen.getByText('5m ago'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Corp data refreshes about hourly.');
  });

  describe('dotOnly', () => {
    it('renders only the dot — the age is screen-reader text, not visible', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      const time = container.querySelector('time');
      expect(time).not.toBeNull();
      const age = screen.getByText('5m ago');
      expect(age.className).toContain('sr-only');
      expect(time).toContainElement(age);
    });

    it('moves the relative age into the tooltip, alongside the absolute timestamp', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      fireEvent.focus(container.querySelector('time') as HTMLElement);
      const tip = screen.getByRole('tooltip');
      expect(tip).toHaveTextContent('5m ago');
      expect(tip).toHaveTextContent(formatTimestamp(date));
    });

    it('still appends a view’s own refresh-cadence note to the tooltip', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(
        <DataAgeBadge date={date} dotOnly note="Corp data refreshes about hourly." />
      );
      fireEvent.focus(container.querySelector('time') as HTMLElement);
      expect(screen.getByRole('tooltip')).toHaveTextContent('Corp data refreshes about hourly.');
    });

    it('keeps the stale tone on the dot', () => {
      const date = new Date(NOW.getTime() - 2 * 86_400_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      expect(container.querySelector('time')?.className).toContain('text-danger');
    });
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
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

  it('is hidden below the md breakpoint — mobile gets the age from Settings’ Data Age tab instead', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} />);
    expect(screen.getByText('5m ago').className).toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(screen.getByText('5m ago').className).toContain('md:inline-flex');
  });

  it('says nothing beyond the timestamp when no note is given', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} />);
    expect(screen.getByText('5m ago')).toHaveAttribute('title', date.toLocaleString());
  });

  /**
   * For a view whose source refreshes on a cadence of its own — corp data is
   * cached by CCP for about an hour — the age alone would leave the amber tone
   * reading as a fault rather than as normal.
   */
  it('appends a view’s own refresh cadence to the tooltip when given one', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    render(<DataAgeBadge date={date} note="Corp data refreshes about hourly." />);
    expect(screen.getByText('5m ago').getAttribute('title')).toContain(
      'Corp data refreshes about hourly.'
    );
  });

  describe('dotOnly', () => {
    it('renders only the dot — no visible age text', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      const time = container.querySelector('time');
      expect(time).not.toBeNull();
      expect(time?.textContent?.trim()).toBe('');
    });

    it('moves the relative age into the tooltip, alongside the absolute timestamp', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      const title = container.querySelector('time')?.getAttribute('title');
      expect(title).toContain('5m ago');
      expect(title).toContain(date.toLocaleString());
    });

    it('still appends a view’s own refresh-cadence note to the tooltip', () => {
      const date = new Date(NOW.getTime() - 5 * 60_000);
      const { container } = render(
        <DataAgeBadge date={date} dotOnly note="Corp data refreshes about hourly." />
      );
      expect(container.querySelector('time')?.getAttribute('title')).toContain(
        'Corp data refreshes about hourly.'
      );
    });

    it('keeps the stale tone on the dot', () => {
      const date = new Date(NOW.getTime() - 2 * 86_400_000);
      const { container } = render(<DataAgeBadge date={date} dotOnly />);
      expect(container.querySelector('time')?.className).toContain('text-danger');
    });
  });
});

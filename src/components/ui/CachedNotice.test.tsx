import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { CachedNotice } from './CachedNotice';

const NOW = new Date('2026-10-16T12:00:00Z');

describe('CachedNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the data is cached and how old it is', () => {
    render(<CachedNotice fetchedAt={NOW.getTime() - 3 * 3_600_000} />);
    expect(screen.getByText('Showing cached data').closest('p')).toHaveTextContent(
      'Showing cached data · 3h ago'
    );
  });

  it('takes a Date as well as epoch ms, and exposes the fetch time on a <time>', () => {
    const at = new Date(NOW.getTime() - 5 * 60_000);
    render(<CachedNotice fetchedAt={at} />);
    expect(screen.getByText('5m ago')).toHaveAttribute('dateTime', at.toISOString());
  });

  it('keeps the sentence and drops the age when the fetch time is unknown', () => {
    const { container } = render(<CachedNotice fetchedAt={null} />);
    expect(container).toHaveTextContent(/^Showing cached data$/);
    expect(container.querySelector('time')).toBeNull();
  });

  it('says the refresh failed when asked', () => {
    render(<CachedNotice fetchedAt={NOW.getTime() - 60_000} refreshFailed />);
    expect(screen.getByText('Refresh failed — showing cached data').closest('p')).toHaveTextContent(
      'Refresh failed — showing cached data · 1m ago'
    );
  });

  it('is visible at every width (no md-hidden class) and not a live region', () => {
    render(<CachedNotice fetchedAt={NOW.getTime()} />);
    const el = screen.getByText('Showing cached data').closest('p')!;
    expect(el.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/);
    expect(el).not.toHaveAttribute('role');
  });
});

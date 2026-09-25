import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CachedEmptyState } from './CachedEmptyState';

const props = { title: 'Nothing cached', hint: 'Reconnect to fetch', fetchedTitle: 'None' };

describe('CachedEmptyState', () => {
  it('shows a plain none line, without the reconnect hint, after a successful fetch', () => {
    render(<CachedEmptyState {...props} result={{ fromCache: false }} />);
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByText('Reconnect to fetch')).not.toBeInTheDocument();
  });

  it.each([
    ['never fetched', null],
    ['served from cache', { fromCache: true }],
  ])('keeps the cached/reconnect copy when %s', (_label, result) => {
    render(<CachedEmptyState {...props} result={result} />);
    expect(screen.getByText('Nothing cached')).toBeInTheDocument();
    expect(screen.getByText('Reconnect to fetch')).toBeInTheDocument();
  });
});

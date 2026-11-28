import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { AnalyticsPageViewTracker } from './AnalyticsPageViewTracker';
import { useDocumentTitleNameStore } from './documentTitleName';

const trackPageView = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./analytics', () => ({ trackPageView }));

describe('AnalyticsPageViewTracker', () => {
  it('sends the route title, never the open item name', () => {
    useDocumentTitleNameStore.setState({ name: 'Alt-X ganker' });
    render(
      <MemoryRouter initialEntries={['/skills/plans/abc123']}>
        <AnalyticsPageViewTracker />
      </MemoryRouter>
    );
    expect(trackPageView).toHaveBeenCalledTimes(1);
    const [path, title] = trackPageView.mock.calls[0] as unknown as [string, string];
    expect(title).toBe('Plans — Skills — Neocom Desk');
    expect(`${path} ${title}`).not.toContain('Alt-X');
    useDocumentTitleNameStore.setState({ name: null });
  });
});

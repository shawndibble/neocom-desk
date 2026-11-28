import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { AnalyticsPageViewTracker } from './AnalyticsPageViewTracker';
import { useDocumentTitleNameStore } from './documentTitleName';
import { DocumentTitleTracker } from './DocumentTitleTracker';
import { MOONS_TAB_PATHS, setMoonsTabsHidden } from '@/features/corp/moons/moonsTabsHidden';

const trackPageView = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('./analytics', () => ({ trackPageView }));

describe('AnalyticsPageViewTracker', () => {
  beforeEach(() => trackPageView.mockClear());

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

  it('sends the same route title as the tab, hidden Moons tabs included', () => {
    setMoonsTabsHidden(true);
    render(
      <MemoryRouter initialEntries={[MOONS_TAB_PATHS[0] ?? '/']}>
        <DocumentTitleTracker />
        <AnalyticsPageViewTracker />
      </MemoryRouter>
    );
    const [, title] = trackPageView.mock.calls[0] as unknown as [string, string];
    expect(title).toBe(document.title);
    setMoonsTabsHidden(false);
  });
});

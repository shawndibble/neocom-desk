import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { HaulingRefreshInfo } from '@/features/market/HaulingPanel';

let info: HaulingRefreshInfo | null = null;
vi.mock('@/features/market/HaulingPanel', () => ({
  HaulingPanel: ({
    onRefreshInfoChange,
  }: {
    onRefreshInfoChange?: (info: HaulingRefreshInfo | null) => void;
  }) => {
    useEffect(() => onRefreshInfoChange?.(info), [onRefreshInfoChange]);
    return <div data-testid="hauling-panel" />;
  },
}));
vi.mock('@/features/market/usePageItemActions', () => ({ usePageItemActions: () => ({}) }));
vi.mock('@/features/market/ItemActionsProvider', () => ({
  ItemActionsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const { HaulingTab } = await import('./HaulingTab');

function renderTab() {
  return render(
    <MemoryRouter>
      <HaulingTab
        tabBar={null}
        tabsId="travel"
        views={{ tabs: [], value: 'hauling', onChange: () => {} }}
      />
    </MemoryRouter>
  );
}

describe('HaulingTab header (#3534)', () => {
  it('shows the ready scan’s Data Age in the page header beside its Refresh', () => {
    info = { refresh: vi.fn(), disabled: false, fetchedAt: Date.now() - 60_000 };
    const { container } = renderTab();

    const header = screen.getByRole('button', { name: 'Refresh' }).closest('header');
    expect(header).not.toBeNull();
    expect(header!.querySelector('time')).not.toBeNull();
    expect(container.querySelectorAll('time')).toHaveLength(1);
  });

  it('shows no Data Age before a scan is ready', () => {
    info = { refresh: vi.fn(), disabled: true, fetchedAt: null };
    const { container } = renderTab();

    expect(container.querySelector('time')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { OpportunitiesFilterBar, OpportunitiesViewPicker } from './OpportunitiesToolbars';

const desktop = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/useIsDesktop', () => ({ useIsDesktop: () => desktop.value }));

const noop = () => {};

describe('OpportunitiesFilterBar', () => {
  it('offers Corp projects after All owned once the Character has projects to show', () => {
    desktop.value = true;
    render(
      <OpportunitiesFilterBar
        view="ranked"
        onViewChange={noop}
        stockFilter="any"
        onStockFilterChange={noop}
        showCorpProjects
      />
    );
    const group = screen.getByRole('group', { name: 'View' });
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Ranked',
      'All owned',
      'Corp projects',
    ]);
  });

  it('leaves Corp projects out when there is nothing to show (the hide rule)', () => {
    desktop.value = true;
    render(
      <OpportunitiesFilterBar
        view="ranked"
        onViewChange={noop}
        stockFilter="any"
        onStockFilterChange={noop}
        showCorpProjects={false}
      />
    );
    expect(screen.queryByText('Corp projects')).toBeNull();
  });

  it('shows no stock filter on the Corp projects view', () => {
    desktop.value = true;
    render(
      <OpportunitiesFilterBar
        view="corp"
        onViewChange={noop}
        stockFilter="any"
        onStockFilterChange={noop}
        showCorpProjects
      />
    );
    expect(screen.queryByRole('group', { name: 'Use my stock' })).toBeNull();
  });
});

describe('OpportunitiesViewPicker', () => {
  it('reads Corp projects in the phone title select', () => {
    desktop.value = false;
    render(<OpportunitiesViewPicker view="corp" onViewChange={noop} showCorpProjects />);
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('Corp projects');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('stock filter', () => {
  it('desktop segmented control reads the full wording and sets the filter', () => {
    desktop.value = true;
    const onStock = vi.fn();
    render(
      <OpportunitiesFilterBar
        view="ranked"
        onViewChange={noop}
        stockFilter="any"
        onStockFilterChange={onStock}
        showCorpProjects={false}
      />
    );
    const group = screen.getByRole('group', { name: 'Use my stock' });
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Any',
      '75%+ covered',
      'Fully covered',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Fully covered' }));
    expect(onStock).toHaveBeenCalledWith('full');
  });

  it('phone select closes on the short word, opens on the full wording, in no wrapper row', async () => {
    desktop.value = false;
    const { container } = render(
      <OpportunitiesFilterBar
        view="ranked"
        onViewChange={noop}
        stockFilter="full"
        onStockFilterChange={noop}
        showCorpProjects={false}
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Use my stock' });
    expect(trigger).toHaveTextContent('Full');
    expect(trigger).not.toHaveTextContent('Fully covered');
    expect(container.querySelector('.basis-full, .max-md\\:basis-full')).toBeNull();
    await userEvent.click(trigger);
    expect(await screen.findByRole('option', { name: 'Fully covered' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '75%+ covered' })).toBeInTheDocument();
  });
});

describe('OpportunitiesViewPicker', () => {
  it('reads Corp projects in the phone title select', () => {
    desktop.value = false;
    render(<OpportunitiesViewPicker view="corp" onViewChange={noop} showCorpProjects />);
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveTextContent('Corp projects');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MultiSelect } from './MultiSelect';

const OPTIONS = [
  { id: 1, label: 'Alice' },
  { id: 2, label: 'Bob' },
  { id: 3, label: 'Carol' },
];

const GROUPS = [
  {
    label: 'Alpha team',
    options: [
      { id: 1, label: 'Alice' },
      { id: 2, label: 'Bob' },
    ],
  },
  {
    label: 'Beta team',
    options: [{ id: 3, label: 'Carol' }],
  },
];

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return user;
}

describe('MultiSelect', () => {
  it('lists every flat option, selected per the current set', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set([1])}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    await openMenu();
    expect(screen.getByRole('option', { name: 'Alice' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Bob' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onToggle with the clicked option id', async () => {
    const onToggle = vi.fn();
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={onToggle}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('option', { name: 'Bob' }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('typing in the search box narrows the visible options by label', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    await user.type(screen.getByPlaceholderText('Search'), 'ali');
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bob' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Carol' })).not.toBeInTheDocument();
  });

  it('clearing the search box restores the full list', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    const search = screen.getByPlaceholderText('Search');
    await user.type(search, 'ali');
    await user.clear(search);
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();
  });

  it('shows the no-results label when nothing matches', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    await user.type(screen.getByPlaceholderText('Search'), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('renders grouped options under their group label, hiding a group with zero matches', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        groups={GROUPS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    expect(screen.getByText('Alpha team')).toBeInTheDocument();
    expect(screen.getByText('Beta team')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search'), 'carol');
    expect(screen.queryByText('Alpha team')).not.toBeInTheDocument();
    expect(screen.getByText('Beta team')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Carol' })).toBeInTheDocument();
  });

  it('renders extraContent above the search box', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
        extraContent={<button>Quick select</button>}
      />
    );
    await openMenu();
    expect(screen.getByRole('button', { name: 'Quick select' })).toBeInTheDocument();
  });

  it('gives a function extraContent a close callback that dismisses the popover', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
        extraContent={(close) => <button onClick={close}>Quick select</button>}
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('button', { name: 'Quick select' }));
    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument();
  });

  it('does not close the popover when an option is toggled', async () => {
    render(
      <MultiSelect
        trigger={<button>Open</button>}
        options={OPTIONS}
        selected={new Set()}
        onToggle={() => {}}
        searchPlaceholder="Search"
        noResultsLabel="No matches"
      />
    );
    const user = await openMenu();
    await user.click(screen.getByRole('option', { name: 'Alice' }));
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });
});

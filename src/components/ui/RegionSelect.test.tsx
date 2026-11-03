import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegionSelect } from './RegionSelect';

const REGIONS = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000043, name: 'Domain' },
  { id: 10000032, name: 'Sinq Laison' },
  { id: 10000030, name: 'Heimatar' },
];

function Harness({
  allLabel,
  initial = null,
  onChange,
}: {
  allLabel?: string;
  initial?: number | null;
  onChange?: (id: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <RegionSelect
      options={REGIONS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      allLabel={allLabel}
      searchPlaceholder="Search regions…"
      noResultsLabel="No matching regions"
      aria-label="Region"
    />
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Region' });
const optionNames = () =>
  screen.getAllByRole('option').map((o) => o.textContent?.replace(/^✓/, ''));

describe('RegionSelect', () => {
  // Tailwind v4's `outline-none` sets `--tw-outline-style: none`, which the
  // `focus-visible:outline-2` ring then inherits — so the two together draw
  // nothing and a keyboard user cannot see where focus is (WCAG 2.4.7).
  it('shows the accent focus ring on keyboard focus', () => {
    render(<Harness />);
    const el = screen.getByRole('combobox', { name: 'Region' });
    expect(el).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-accent');
    expect(el).not.toHaveClass('outline-none');
  });

  it('lists regions alphabetically whatever order they arrive in', async () => {
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" />);
    await user.click(trigger());
    expect(optionNames()).toEqual([
      'All regions',
      'Domain',
      'Heimatar',
      'Sinq Laison',
      'The Forge',
    ]);
  });

  it('shows the selected name, and All maps back to null', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" initial={10000002} onChange={onChange} />);
    expect(trigger()).toHaveTextContent('The Forge');
    await user.click(trigger());
    expect(screen.getByRole('option', { name: 'The Forge' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.click(screen.getByRole('option', { name: 'All regions' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(trigger()).toHaveTextContent('All regions');
  });

  it('filters by case-insensitive substring, keeping All pinned on top', async () => {
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" />);
    await user.click(trigger());
    await user.type(screen.getByRole('combobox', { name: 'Search regions…' }), 'FOR');
    expect(optionNames()).toEqual(['All regions', 'The Forge']);

    await user.type(screen.getByRole('combobox', { name: 'Search regions…' }), 'zzz');
    expect(optionNames()).toEqual(['All regions']);
    expect(screen.getByText('No matching regions', { selector: 'p' })).toBeInTheDocument();
  });

  it('picks with the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" onChange={onChange} />);
    await user.click(trigger());
    // Opens highlighting the current value (All); two down lands on Heimatar.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(10000030);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Heimatar');

    await user.click(trigger());
    await user.keyboard('{End}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(10000002);
  });

  it('Enter after typing takes the first match', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" onChange={onChange} />);
    await user.click(trigger());
    await user.keyboard('sinq{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(10000032);
  });

  it('has no All option when allLabel is omitted', async () => {
    const user = userEvent.setup();
    render(<Harness initial={10000043} />);
    expect(trigger()).toHaveTextContent('Domain');
    await user.click(trigger());
    expect(optionNames()).toEqual(['Domain', 'Heimatar', 'Sinq Laison', 'The Forge']);
  });

  it('names the dialog and announces no results', async () => {
    const user = userEvent.setup();
    render(<Harness allLabel="All regions" />);
    await user.click(trigger());
    expect(screen.getByRole('dialog', { name: 'Region' })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search regions…'), 'zzzz');
    expect(await screen.findByRole('status')).toHaveTextContent('No matching regions');
    expect(screen.getByText('No matching regions', { selector: 'p' })).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});

describe('RegionSelect shortcut', () => {
  function WithShortcut({
    shortcut,
    onChange = () => {},
  }: {
    shortcut: NonNullable<Parameters<typeof RegionSelect>[0]['shortcut']>;
    onChange?: (id: number | null) => void;
  }) {
    return (
      <RegionSelect
        options={REGIONS}
        value={null}
        onChange={onChange}
        allLabel="All regions"
        searchPlaceholder="Search regions…"
        noResultsLabel="No matching regions"
        aria-label="Region"
        shortcut={shortcut}
      />
    );
  }

  it('picks the region the shortcut answers with, and closes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WithShortcut
        onChange={onChange}
        shortcut={{ label: 'From my region', onSelect: () => 10000002 }}
      />
    );

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'From my region' }));

    expect(onChange).toHaveBeenCalledWith(10000002);
    expect(screen.queryByRole('button', { name: 'From my region' })).not.toBeInTheDocument();
  });

  it('stays open and picks nothing when the shortcut answers null', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WithShortcut
        onChange={onChange}
        shortcut={{ label: 'From my region', onSelect: async () => null }}
      />
    );

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'From my region' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'From my region' })).toBeInTheDocument();
  });

  it('shows the note and blocks the click when disabled', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <WithShortcut
        shortcut={{ label: 'From my region', disabled: true, note: 'Unavailable', onSelect }}
      />
    );

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'From my region' }));

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

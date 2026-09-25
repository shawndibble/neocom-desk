import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { HullPicker } from './HullPicker';
import type { FittingCatalogue } from './useFittingCatalogue';

const groups = [
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 8, name: 'Cruisers', parentId: 4, hasTypes: false },
  { id: 801, name: 'Gallente', parentId: 8, hasTypes: true },
  { id: 5, name: 'Frigates', parentId: 4, hasTypes: false },
  { id: 511, name: 'Minmatar', parentId: 5, hasTypes: true },
];

const catalogue = {
  groupsById: new Map(groups.map((group) => [group.id, group])),
  marketTypes: [
    { typeId: 626, name: 'Vexor', marketGroupId: 801 },
    { typeId: 587, name: 'Rifter', marketGroupId: 511 },
  ],
} as unknown as FittingCatalogue;

describe('HullPicker', () => {
  const search = (value: string) =>
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search hulls' }), {
      target: { value },
    });

  it('lists no hulls until there is a search', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
    expect(screen.getByText('Search for a hull to begin.')).toBeTruthy();
    search('  ');
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
  });

  it('groups matches by class and starts the one picked', () => {
    const onStart = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={onStart} />);
    search('r');
    expect(screen.getByRole('heading', { name: /Frigates/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Cruisers/ })).toBeTruthy();

    const start = screen.getByRole('button', { name: 'Start fitting' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Vexor' }));
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith({ typeId: 626, name: 'Vexor', group: 'Gallente' });
  });

  it('narrows the classes to the hulls the search matches', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    search('rift');
    expect(screen.getByRole('button', { name: 'Rifter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Cruisers/ })).toBeNull();
  });

  it('starts a hull at once on double-click', () => {
    const onStart = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={onStart} />);
    search('rift');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rifter' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ typeId: 587 }));
  });
});

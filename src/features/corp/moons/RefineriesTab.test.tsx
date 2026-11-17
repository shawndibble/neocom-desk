import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { RefineryRow } from '@/engine/corpTaxBook/moonOwnerRefineries';
import { RefineriesTab } from './RefineriesTab';
import type { RefineryList } from './useRefineryList';

let list: RefineryList;
vi.mock('./useRefineryList', () => ({ useRefineryList: () => list }));
vi.mock('./useBook', () => ({
  useBook: () => ({
    corporationId: 98000001,
    canEdit: true,
    characterId: 5,
    reload: vi.fn(),
    names: {
      refinery: (id: number) => `Station ${id}`,
      ownerRefinery: (id: number) => `Station ${id}`,
      moon: (id: number) => `Moon ${id}`,
      corporation: (id: number) => `Corp ${id}`,
      character: (id: number) => `Officer ${id}`,
    },
  }),
}));

const entry = (structureId: number, over = {}) => ({
  structureId,
  extractionCount: 1,
  states: { fractured: 1 },
  tax: 0,
  ...over,
});
const archivedRow: RefineryRow = {
  structureId: 3,
  moonId: 12,
  extractionCount: 1,
  mined: 0,
  offer: null,
  archive: { at: Date.UTC(2026, 10, 3), by: 5, reason: 'manual' },
};

const open = () =>
  render(
    <MemoryRouter>
      <RefineriesTab />
    </MemoryRouter>
  );

describe('RefineriesTab', () => {
  it('lists one row per refinery, the refinery name first and a link to its page', () => {
    list = {
      active: [entry(1, { moonId: 10 }), entry(2, { moonId: 11, ownerId: 77 })],
      archived: [],
    };
    open();
    expect(screen.getByRole('link', { name: 'Station 1' })).toHaveAttribute(
      'href',
      '/corp/moons/refineries/1'
    );
    expect(screen.getByRole('link', { name: 'Station 2' })).toBeTruthy();
    expect(screen.getByText('Moon 10')).toBeTruthy();
    expect(screen.getByText('Corp 77')).toBeTruthy();
  });

  it('says the moon is not known for a refinery with no Extraction yet', () => {
    list = { active: [entry(1, { extractionCount: 0, states: {} })], archived: [] };
    open();
    expect(screen.getByText('Moon not known yet')).toBeTruthy();
  });

  it('keeps an archived refinery out of the list, folded under it with its Restore', async () => {
    list = { active: [entry(1, { moonId: 10 })], archived: [{ row: archivedRow, ownerId: 77 }] };
    open();
    expect(screen.queryByRole('link', { name: 'Station 3' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show archived refineries' }));
    expect(screen.getByRole('link', { name: 'Station 3' })).toHaveAttribute(
      'href',
      '/corp/moons/refineries/3'
    );
    expect(screen.getByRole('button', { name: 'Restore Station 3' })).toBeTruthy();
  });
});

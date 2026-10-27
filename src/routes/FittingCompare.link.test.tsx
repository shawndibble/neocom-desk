import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { FittingCompare } from './FittingCompare';

vi.mock('@/sde/loadSde', () => ({ loadTypes: async () => ({}), loadSkills: async () => [] }));
vi.mock('@/features/fittings/fittingPrice', () => ({ loadFittingPrice: async () => null }));
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({
  readyDogmaEngine: () => null,
  subscribeDogmaEngine: () => () => {},
  computeFittingStats: () => Promise.reject(new Error('no dogma engine in tests')),
}));
// Stable references, as the real hook's cache keeps them.
const cache = vi.hoisted(() => new Map<string, readonly unknown[]>());
vi.mock('@/features/fittings/useCompareFittings', () => ({
  useCompareFittings: (codes: readonly string[]) => {
    const key = codes.join(',');
    if (!cache.has(key)) {
      const fitting = { name: 'Brawler', shipTypeId: 1, modules: [], cargo: [] };
      cache.set(
        key,
        codes.map((code) => ({ code, fitting, shareError: null }))
      );
    }
    return cache.get(key);
  },
}));

describe('FittingCompare column header', () => {
  it('names the fitting with a link to open it in the editor', async () => {
    render(
      <MemoryRouter initialEntries={['/ships/fittings/compare?f=abc']}>
        <Routes>
          <Route path="/ships/fittings/compare" element={<FittingCompare />} />
        </Routes>
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: 'Brawler' });
    expect(link.getAttribute('href')).toContain('f=abc');
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
  });
});

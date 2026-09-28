import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { FittingCompare } from './FittingCompare';

vi.mock('@/sde/loadSde', () => ({ loadTypes: async () => ({}), loadSkills: async () => [] }));
vi.mock('@/features/fittings/fittingPrice', () => ({ loadFittingPrice: async () => null }));
vi.mock('@/features/fittings/dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: () => Promise.reject(new Error('no dogma engine in tests')),
}));

beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/ships/fittings/compare" element={<FittingCompare />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('FittingCompare', () => {
  it('shows a remove control for a slot that failed to decode', async () => {
    renderAt('/ships/fittings/compare?f=not-a-real-code');
    const removeButton = await screen.findByRole('button', { name: 'Remove' });
    expect(removeButton.className).toContain('text-danger');
  });

  it('removes an error-only slot via its own Remove control', async () => {
    const user = userEvent.setup();
    renderAt('/ships/fittings/compare?f=not-a-real-code');
    const removeButton = await screen.findByRole('button', { name: 'Remove' });
    await user.click(removeButton);
    expect(await screen.findByText('Add a Fitting to start comparing.')).toBeInTheDocument();
  });

  it('caps the page content at the shared max-w-6xl width', async () => {
    renderAt('/ships/fittings/compare');
    const heading = await screen.findByRole('heading', { name: 'Compare Fittings' });
    expect(heading.closest('.max-w-6xl')).toBeInTheDocument();
  });

  it('shows exactly one primary Add Fitting button in the empty state', async () => {
    renderAt('/ships/fittings/compare');
    const addButtons = await screen.findAllByRole('button', { name: 'Compare with…' });
    expect(addButtons).toHaveLength(2);
    const primaryButtons = addButtons.filter((button) => button.className.includes('bg-accent'));
    expect(primaryButtons).toHaveLength(1);
  });
});

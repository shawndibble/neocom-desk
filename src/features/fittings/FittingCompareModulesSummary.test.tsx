import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FittingCompareModulesSummary } from './FittingCompareModulesSummary';

vi.mock('@/sde/loadSde', () => ({ typeName: async (id: number) => `Module ${id}` }));

describe('FittingCompareModulesSummary', () => {
  it('puts each count under its own fit header, dashing failed columns', async () => {
    render(
      <FittingCompareModulesSummary
        entries={[{ typeId: 1, counts: [2, 0] }]}
        columns={[
          { index: 0, statsIndex: 0, header: 'Fit A' },
          { index: 1, statsIndex: 1, header: 'Fit B' },
          { index: 2, statsIndex: null, header: 'Fit C' },
        ]}
      />
    );
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(1)).toEqual(['Fit A', 'Fit B', 'Fit C']);
    const row = (await screen.findByText('Module 1')).closest('tr')!;
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Module 1', '2', '0', '—']);
  });
});

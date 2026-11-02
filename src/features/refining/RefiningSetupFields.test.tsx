import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { Fields } from '@/components/ui';
import { RefiningSetupFields } from './RefiningSetupFields';
import type { useRefiningSetup } from './useRefiningSetup';

const multiplier = vi.hoisted(() => ({ value: null as number | null }));
vi.mock('./useReferenceSkillsMultiplier', () => ({
  useReferenceSkillsMultiplier: () => multiplier.value,
}));

function setup(stationRate = 0.51) {
  const refining: ReturnType<typeof useRefiningSetup> = {
    setup: { stationRate, taxRate: 0 },
    hydrated: true,
    setYieldRate: vi.fn(() => Promise.resolve()),
    setTaxRate: vi.fn(() => Promise.resolve()),
  };
  render(
    <Fields variant="form">
      <RefiningSetupFields refining={refining} />
    </Fields>
  );
  return refining;
}

afterEach(() => {
  cleanup();
  multiplier.value = null;
});

describe('RefiningSetupFields', () => {
  it('asks for the reprocessing yield the EVE client shows, and shows the base it works out', () => {
    multiplier.value = 1.08 * 1.15 * 1.1;
    setup(0.51);
    // 51% base x 1.366 reads as the client's 69.7%.
    expect(screen.getByRole('button', { name: /Edit Reprocessing yield/ })).toHaveTextContent(
      '69.68%'
    );
    expect(screen.queryByText('Facility base yield')).not.toBeInTheDocument();
    expect(screen.getByText(/now 51%/)).toBeInTheDocument();
  });

  it('saves the facility base yield behind a typed reprocessing yield', async () => {
    multiplier.value = 1.08 * 1.15 * 1.1;
    const user = userEvent.setup();
    const refining = setup(0.5);
    await user.click(screen.getByRole('button', { name: /Edit Reprocessing yield/ }));
    const field = screen.getByRole('textbox', { name: 'Reprocessing yield' });
    await user.clear(field);
    await user.type(field, '69.7{Enter}');
    expect(refining.setYieldRate).toHaveBeenCalledWith(0.5102);
    expect(refining.setTaxRate).not.toHaveBeenCalled();
  });

  it('falls back to the facility base yield with no skills to divide out', async () => {
    multiplier.value = null;
    const user = userEvent.setup();
    const refining = setup(0.5);
    expect(screen.queryByText('Reprocessing yield')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Edit Facility base yield/ }));
    const field = screen.getByRole('textbox', { name: 'Facility base yield' });
    await user.clear(field);
    await user.type(field, '51{Enter}');
    expect(refining.setYieldRate).toHaveBeenCalledWith(0.51);
  });
});

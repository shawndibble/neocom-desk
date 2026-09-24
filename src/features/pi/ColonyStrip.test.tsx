import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ColonyStrip } from './ColonyStrip';
import type { ColonyStripRow } from './colonyStripModel';

function row(overrides: Partial<ColonyStripRow> = {}): ColonyStripRow {
  return {
    planetId: 40000001,
    name: 'Efa II',
    planetType: 'temperate',
    load: 0.82,
    hoursToFull: 30,
    faults: 2,
    steps: 0,
    overflowing: true,
    ...overrides,
  };
}

describe('ColonyStrip', () => {
  it('reads a clear colony as clear, without the overflow warning', () => {
    render(
      <ColonyStrip
        rows={[row({ faults: 0, overflowing: false, hoursToFull: 72 })]}
        onOpenPlanet={() => {}}
        locked={null}
      />
    );
    expect(screen.getByRole('button', { name: 'Details for Efa II' })).toHaveAccessibleDescription(
      '82% of budget in use. Nothing to change. Full in 3 d.'
    );
  });

  it('names the row by what it opens and describes the state it shows', () => {
    render(<ColonyStrip rows={[row()]} onOpenPlanet={() => {}} locked={null} />);
    const button = screen.getByRole('button', { name: 'Details for Efa II' });
    expect(button).toHaveAccessibleDescription(
      '82% of budget in use. 2 faults. Full in 30 h, before the next haul.'
    );
  });

  it('says so when neither load nor time to full can be read', () => {
    render(
      <ColonyStrip
        rows={[row({ load: null, hoursToFull: null, faults: 0, overflowing: false })]}
        onOpenPlanet={() => {}}
        locked={null}
      />
    );
    expect(screen.getByRole('button', { name: 'Details for Efa II' })).toHaveAccessibleDescription(
      'Load unknown. Time to full unknown.'
    );
  });
});

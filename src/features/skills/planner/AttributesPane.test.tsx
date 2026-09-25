import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { AttributesPane } from './AttributesPane';
import type { RemapAvailability } from './remapAvailability';

describe('AttributesPane remap availability (#1726)', () => {
  it('shows nothing about remaps when there is no ESI attributes data', () => {
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={null} />);

    expect(screen.queryByText(/remap/i)).toBeNull();
  });

  it('shows live remap availability independent of any open plan', () => {
    const remapInfo: RemapAvailability = {
      available: 2,
      bonus: 1,
      yearlyReady: true,
      cooldownUntil: null,
    };
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={remapInfo} />);

    expect(screen.getByText('Remaps: 1 bonus now · yearly ready')).toBeInTheDocument();
  });

  it('shows the cooldown date when the yearly remap is not ready yet', () => {
    const remapInfo: RemapAvailability = {
      available: 1,
      bonus: 1,
      yearlyReady: false,
      cooldownUntil: new Date('2027-03-12T00:00:00Z'),
    };
    render(<AttributesPane result={null} implantBonuses={{}} remapInfo={remapInfo} />);

    expect(screen.getByText(/^Remaps: 1 bonus now · yearly from /)).toBeInTheDocument();
  });
});

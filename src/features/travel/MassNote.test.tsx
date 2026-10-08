import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MassNote } from './MassNote';
import '@/i18n';

const state = vi.hoisted(() => ({ ship: null as { name: string; massKg: number } | null }));
vi.mock('@/features/route/routeShip', () => ({
  useRouteShipMass: () => ({
    ship: state.ship,
    hulls: [],
    holeTable: { Q063: [62_000_000, 500_000_000] },
  }),
}));

describe('MassNote', () => {
  beforeEach(() => {
    state.ship = null;
  });

  it('says nothing without a ship', () => {
    const { container } = render(<MassNote hole={{ wormholeType: 'Q063' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing for a ship that can pass', () => {
    state.ship = { name: 'Vexor', massKg: 11_000_000 };
    const { container } = render(<MassNote hole={{ wormholeType: 'Q063' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states the per-jump limit plainly for a ship that is too heavy', () => {
    state.ship = { name: 'Megathron', massKg: 98_400_000 };
    render(<MassNote hole={{ wormholeType: 'Q063' }} />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Too heavy for this hole, limit 62 Mt (Megathron is 98 Mt)'
    );
  });

  it('checks a bridge against the Ansiblex limit', () => {
    state.ship = { name: 'Charon', massKg: 960_000_000 };
    render(<MassNote hole="bridge" />);
    expect(screen.queryByRole('note')).toBeNull();
    state.ship = { name: 'Avatar', massKg: 2_000_000_000 };
    render(<MassNote hole="bridge" />);
    expect(screen.getByRole('note')).toHaveTextContent('limit 1,480 Mt');
  });
});

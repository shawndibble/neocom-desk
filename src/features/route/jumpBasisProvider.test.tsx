import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const useAnsiblexGates = vi.fn(() => undefined);
const useRouteHoles = vi.fn(() => ({ kind: 'ready', holes: [] }));

vi.mock('./ansiblexGates', () => ({
  useAnsiblexGates: () => useAnsiblexGates(),
  gatesOf: vi.fn(),
}));
vi.mock('./useRouteHoles', () => ({ useRouteHoles: () => useRouteHoles() }));
vi.mock('./routeRules', () => ({
  useRouteQuery: () => ({
    rules: { preference: 'shortest', securityPenalty: 50, avoid: [] },
    key: 'r',
    hydrated: true,
    podKillsUnavailable: false,
  }),
  loadRouteRules: vi.fn(),
}));
vi.mock('./routeHoleSettings', () => ({
  useRouteHoleQuery: () => ({ enabled: false, hydrated: true, settings: {} }),
  loadRouteHoleQuery: vi.fn(),
  NO_HOLE_OVERRIDES: {},
}));
vi.mock('./routeBridgeSettings', () => ({
  useRouteBridgeQuery: () => ({ enabled: false, hydrated: true }),
  useRouteBridgesEnabled: {},
}));

import { JumpBasisProvider, useSharedJumpBasis } from './jumpBasis';

function Consumer({ onBasis }: { onBasis: (key: string) => void }) {
  onBasis(useSharedJumpBasis().key);
  return null;
}

describe('JumpBasisProvider', () => {
  it('works the basis out once for every consumer under it', () => {
    const seen: string[] = [];
    useAnsiblexGates.mockClear();
    render(
      <JumpBasisProvider>
        {[1, 2, 3, 4].map((n) => (
          <Consumer key={n} onBasis={(k) => seen.push(k)} />
        ))}
      </JumpBasisProvider>
    );
    expect(seen).toEqual(['r||', 'r||', 'r||', 'r||']);
    expect(useAnsiblexGates).toHaveBeenCalledTimes(1);
  });

  it('works it out itself with no provider', () => {
    const seen: string[] = [];
    render(<Consumer onBasis={(k) => seen.push(k)} />);
    expect(seen[0]).toBe('r||');
  });
});

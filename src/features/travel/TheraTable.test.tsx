import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import type { TheraConnectionRow } from '@/engine/route/theraConnections';
import { canUseInRoute } from '@/engine/route/theraConnections';
import { TheraTable } from './TheraTable';

const ROWS: TheraConnectionRow[] = [1, 2, 3].map((n) => ({
  id: `hole-${n}`,
  hub: 'thera',
  hubSignature: `ABC-00${n}`,
  exitSignature: `XYZ-00${n}`,
  exitSystemId: 30000000 + n,
  exitSystemName: `System ${n}`,
  exitClass: 'hs',
  exitRegionName: 'The Forge',
  wormholeType: 'K162',
  maxShipSize: null,
  expiresAt: 0,
  exitSecurity: 0.9,
  exitSpace: 'highsec',
  remainingMs: 8 * 60 * 60 * 1000,
  lifeWarning: false,
  jumps: { kind: 'known', jumps: n },
}));

const cellRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/components/SecurityStatus', () => ({
  SecurityStatus: () => {
    cellRenders.count++;
    return null;
  },
}));

describe('TheraTable render count', () => {
  it('skips re-rendering when an unrelated parent update leaves its props alone', () => {
    function Parent() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN(n + 1)}>bump {n}</button>
          <TheraTable rows={ROWS} label="Holes" />
        </>
      );
    }
    render(
      <MemoryRouter>
        <Parent />
      </MemoryRouter>
    );
    const afterMount = cellRenders.count;
    expect(afterMount).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('bump 0'));
    expect(screen.getByText('bump 1')).toBeTruthy();
    expect(cellRenders.count).toBe(afterMount);
  });
});

describe('canUseInRoute', () => {
  it('offers K-space exits a gate route reaches', () => {
    expect(canUseInRoute(ROWS[0]!)).toBe(true);
  });

  it('is not offered into J-space, or where the jumps are unknown', () => {
    expect(canUseInRoute({ ...ROWS[0]!, exitSpace: 'wormhole' })).toBe(false);
    expect(canUseInRoute({ ...ROWS[0]!, jumps: { kind: 'no-route' } })).toBe(false);
    expect(canUseInRoute({ ...ROWS[0]!, jumps: { kind: 'unknown' } })).toBe(false);
    expect(canUseInRoute({ ...ROWS[0]!, jumps: { kind: 'no-origin' } })).toBe(false);
  });
});

describe('TheraTable Use in route', () => {
  it('shows a Use in route button naming the exit, and hands the row on', () => {
    const onUse = vi.fn();
    render(
      <MemoryRouter>
        <TheraTable rows={ROWS} label="Holes" onUse={onUse} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByRole('button', { name: /System 2/ })[0]!);
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'hole-2' }));
  });

  it('shows no button without onUse', () => {
    render(
      <MemoryRouter>
        <TheraTable rows={ROWS} label="Holes" />
      </MemoryRouter>
    );
    expect(screen.queryByText('Use in route')).toBeNull();
  });
});

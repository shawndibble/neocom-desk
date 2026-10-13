import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import type { TheraConnectionRow } from '@/engine/route/theraConnections';
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

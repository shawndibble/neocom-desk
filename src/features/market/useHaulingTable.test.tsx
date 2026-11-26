import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { FAILOVER } from '@/features/campaigns/turnInStoryData';
import { getTradeHub } from '@/market/hubs';
import type { HaulingViewRow } from './haulingView';
import { useHaulingTable } from './useHaulingTable';

vi.mock('@/features/campaigns/useTurnIns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/campaigns/useTurnIns')>()),
  useParticipation: () => ({ status: 'idle', data: undefined, retry: vi.fn() }),
}));

const row = (typeId: number, name: string) =>
  ({ typeId, name, price: 57_990, toHub: getTradeHub('jita') }) as unknown as HaulingViewRow;

function sellCell(turnInOfferFor: (row: HaulingViewRow) => typeof FAILOVER | null) {
  const { result } = renderHook(() =>
    useHaulingTable({
      instant: false,
      anyEnd: null,
      cards: false,
      compact: false,
      windowed: false,
      lineOf: new Map(),
      suggestedProfitOf: new Map(),
      overrides: new Map(),
      patchOverride: vi.fn(),
      addedFromOf: () => null,
      limitTextOf: () => undefined,
      turnInOfferFor,
    })
  );
  const column = result.current.visibleColumns.find((c) => c.id === 'expected')!;
  return column.render;
}

describe('Hauling Sell column turn-in', () => {
  it('puts a dim glyph after the sell price, opening the detail with what the turn-in pays', async () => {
    const render$ = sellCell((r) => (r.typeId === FAILOVER.typeId ? FAILOVER : null));
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <div onClick={onRowClick}>{render$(row(FAILOVER.typeId, 'Shield Failover Report'))}</div>
      </MemoryRouter>
    );
    expect(screen.getByText('57,990')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Turn-in reward for Shield Failover Report' })
    );
    expect(onRowClick).not.toHaveBeenCalled();
    expect(await screen.findByText('Pays ~2K each over selling here (57,990)')).toBeInTheDocument();
    expect(screen.queryByText(/Turn-in pays/)).not.toBeInTheDocument();
  });

  it('adds no line when selling here pays as much', async () => {
    const render$ = sellCell((r) => (r.typeId === FAILOVER.typeId ? FAILOVER : null));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        {render$({ ...row(FAILOVER.typeId, 'Shield Failover Report'), price: 70_000 })}
      </MemoryRouter>
    );
    await user.click(
      screen.getByRole('button', { name: 'Turn-in reward for Shield Failover Report' })
    );
    expect(await screen.findByText('each turned in')).toBeInTheDocument();
    expect(screen.queryByText(/over selling here/)).not.toBeInTheDocument();
  });

  it('leaves an item no Campaign Objective takes as its price alone', () => {
    const render$ = sellCell(() => null);
    render(<>{render$(row(34, 'Tritanium'))}</>);
    expect(screen.getByText('57,990')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

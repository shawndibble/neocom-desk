import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { OwnedStockChange } from '@/engine/industry/ownedStockOffer';
import { useOwnedStockBulk } from './useOwnedStockBulk';

function Harness({
  owned,
  write,
}: {
  owned: Record<number, number>;
  write: (changes: readonly OwnedStockChange[]) => void;
}) {
  const bulk = useOwnedStockBulk({
    write,
    ownedFor: (typeID) => owned[typeID],
    scopedQuantityFor: () => 0,
  });
  return (
    <>
      <button type="button" onClick={() => bulk.clearAll([{ typeID: 34 }])}>
        clear
      </button>
      {bulk.toast}
    </>
  );
}

describe('useOwnedStockBulk', () => {
  // A store whose write is built from the ledger it last rendered (the Group
  // Owned Overlay's) would otherwise lose an edit made while the toast was up.
  it('writes Undo through the latest render, not the one that clicked', async () => {
    const user = userEvent.setup();
    const clickTimeWrite = vi.fn();
    const { rerender } = render(<Harness owned={{ 34: 40 }} write={clickTimeWrite} />);
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(clickTimeWrite).toHaveBeenCalledWith([{ typeID: 34, from: 40, to: 0 }]);

    const laterWrite = vi.fn();
    rerender(<Harness owned={{ 35: 3 }} write={laterWrite} />);
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(laterWrite).toHaveBeenCalledWith([{ typeID: 34, from: 0, to: 40 }]);
    expect(clickTimeWrite).toHaveBeenCalledTimes(1);
  });
});

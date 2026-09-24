import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { PlanBooster } from '@/db';
import { BoosterList } from './BoosterList';

function renderList(boosters: PlanBooster[], detectedAccelerator: number | null = null) {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <BoosterList
        boosters={boosters}
        detectedAccelerator={detectedAccelerator}
        onChange={onChange}
      />
    </MemoryRouter>
  );
  return { onChange };
}

const ROW = (overrides: Partial<PlanBooster> = {}): PlanBooster => ({
  enabled: true,
  bonus: 3,
  startsAt: null,
  expiresAt: null,
  ...overrides,
});

describe('BoosterList empty state', () => {
  it('shows only the add affordance when there are no rows', () => {
    renderList([]);
    expect(screen.queryByLabelText('Booster')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add accelerator' })).toBeInTheDocument();
  });

  it('appends a fresh enabled row starting where the previous one left off', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW({ bonus: 6, expiresAt: 5000 })]);

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));

    expect(onChange).toHaveBeenCalledWith([
      ROW({ bonus: 6, expiresAt: 5000 }),
      { enabled: true, bonus: 3, startsAt: 5000, expiresAt: null },
    ]);
  });
});

describe('BoosterList row editing', () => {
  it('removes a row', async () => {
    const user = userEvent.setup();
    const rows = [ROW({ bonus: 3 }), ROW({ bonus: 6 })];
    const { onChange } = renderList(rows);

    await user.click(screen.getAllByRole('button', { name: 'Remove accelerator' })[0]);

    expect(onChange).toHaveBeenCalledWith([rows[1]]);
  });

  it('clamps the bonus on write', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW()]);

    const bonus = screen.getByLabelText('Bonus');
    await user.clear(bonus);
    await user.type(bonus, '45');

    expect(onChange).toHaveBeenLastCalledWith([ROW({ bonus: 30 })]);
  });
});

describe('BoosterList overlap validation', () => {
  it('rejects an expiry edit that would overlap the next row, without calling onChange', async () => {
    const user = userEvent.setup();
    const rows = [
      ROW({ startsAt: null, expiresAt: 1000 }),
      ROW({ startsAt: 1000, expiresAt: 2000 }),
    ];
    const { onChange } = renderList(rows);

    // Push the first row's expiry past the second row's start.
    const expiresInputs = screen.getAllByLabelText<HTMLInputElement>('Expires');
    await user.clear(expiresInputs[0]);
    await user.type(expiresInputs[0], '2099-01-01T00:00');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByText(/overlaps another/i).length).toBeGreaterThan(0);
  });

  it('accepts an edit that keeps rows non-overlapping', async () => {
    const user = userEvent.setup();
    const rows = [
      ROW({ startsAt: null, expiresAt: 1000 }),
      ROW({ startsAt: 1000, expiresAt: 2000 }),
    ];
    const { onChange } = renderList(rows);

    const bonusInputs = screen.getAllByLabelText<HTMLInputElement>('Bonus');
    await user.clear(bonusInputs[0]);
    await user.type(bonusInputs[0], '5');

    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByText(/overlaps another/i)).toBeNull();
  });
});

describe('BoosterList quick picks', () => {
  it('measures a quick pick from the row’s own startsAt, not from now', async () => {
    const user = userEvent.setup();
    const futureStart = new Date(2099, 0, 1).getTime();
    const { onChange } = renderList([ROW({ startsAt: futureStart, expiresAt: null })]);

    await user.click(screen.getByRole('button', { name: '+1h' }));

    expect(onChange).toHaveBeenCalledWith([
      ROW({ startsAt: futureStart, expiresAt: futureStart + 60 * 60 * 1000 }),
    ]);
  });
});

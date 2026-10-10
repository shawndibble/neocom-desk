import { useState } from 'react';
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
    expect(screen.queryByRole('button', { name: /^Remove accelerator [0-9]/ })).toBeNull();
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

    await user.click(screen.getAllByRole('button', { name: /^Remove accelerator [0-9]/ })[0]);

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

describe('BoosterList time left', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('shows the saved expiry as days, hours and minutes left', () => {
    const expiresAt = Date.now() + 2 * DAY + 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
    renderList([ROW({ expiresAt })]);

    expect(screen.getByLabelText<HTMLInputElement>('Days').value).toBe('2');
    expect(screen.getByLabelText<HTMLInputElement>('Hours').value).toBe('5');
    expect(screen.getByLabelText<HTMLInputElement>('Minutes').value).toMatch(/^(29|30)$/);
  });

  it('stores what is typed as an instant that long from now', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW()]);

    const before = Date.now();
    await user.type(screen.getByLabelText('Days'), '3');

    const [rows] = onChange.mock.calls.at(-1) as [PlanBooster[]];
    expect(rows[0].expiresAt).toBeGreaterThanOrEqual(before + 3 * DAY);
    expect(rows[0].expiresAt).toBeLessThan(before + 3 * DAY + 5000);
  });

  it('counts a blank box as zero', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW()]);

    const before = Date.now();
    await user.type(screen.getByLabelText('Hours'), '2');

    const [rows] = onChange.mock.calls.at(-1) as [PlanBooster[]];
    expect(rows[0].expiresAt).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000);
    expect(rows[0].expiresAt).toBeLessThan(before + 2 * 60 * 60 * 1000 + 5000);
  });

  it('ignores anything that is not digits', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW()]);

    await user.type(screen.getByLabelText('Days'), 'ab-.');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not erase a saved expiry while a box is cleared to be retyped', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW({ expiresAt: Date.now() + 5 * DAY })]);

    await user.clear(screen.getByLabelText('Days'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears the expiry once every box is emptied and focus leaves', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW({ expiresAt: Date.now() + 5 * DAY })]);

    await user.clear(screen.getByLabelText('Days'));
    await user.clear(screen.getByLabelText('Hours'));
    await user.clear(screen.getByLabelText('Minutes'));
    await user.tab();

    expect(onChange).toHaveBeenCalledWith([ROW({ expiresAt: null })]);
  });

  it('has no Starts field — a queued row says it follows the one before', () => {
    renderList([ROW({ expiresAt: 5000 }), ROW({ startsAt: 5000 })]);

    expect(screen.queryByLabelText('Starts')).toBeNull();
    expect(screen.getAllByText(/before it runs out/i)).toHaveLength(1);
  });

  it('runs a first row from now even if an older build saved a future start on it', async () => {
    const user = userEvent.setup();
    const { onChange } = renderList([ROW({ startsAt: Date.now() + 9 * DAY, expiresAt: null })]);

    await user.type(screen.getByLabelText('Days'), '2');

    const [rows] = onChange.mock.calls.at(-1) as [PlanBooster[]];
    expect(rows[0].startsAt).toBeNull();
    expect(rows[0].expiresAt).toBeLessThan(Date.now() + 2 * DAY + 5000);
  });

  it('moves a queued row with the one in front of it, keeping its length', async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const { onChange } = renderList([
      ROW({ expiresAt: now + 5 * DAY }),
      ROW({ startsAt: now + 5 * DAY, expiresAt: now + 35 * DAY }),
    ]);

    await user.type(screen.getAllByLabelText('Days')[0], '0');

    const [rows] = onChange.mock.calls.at(-1) as [PlanBooster[]];
    expect(rows[1].startsAt).toBe(rows[0].expiresAt);
    expect((rows[1].expiresAt as number) - (rows[1].startsAt as number)).toBe(30 * DAY);
  });
});

describe('BoosterList quick picks', () => {
  it('measures a queued row’s quick pick from its own start, not from now', async () => {
    const user = userEvent.setup();
    const futureStart = new Date(2099, 0, 1).getTime();
    const { onChange } = renderList([
      ROW({ expiresAt: futureStart }),
      ROW({ startsAt: futureStart, expiresAt: null }),
    ]);

    await user.click(screen.getAllByRole('button', { name: '+1h' })[1]);

    expect(onChange).toHaveBeenCalledWith([
      ROW({ expiresAt: futureStart }),
      ROW({ startsAt: futureStart, expiresAt: futureStart + 60 * 60 * 1000 }),
    ]);
  });
});

describe('BoosterList focus after remove', () => {
  function StatefulList({ initial }: { initial: PlanBooster[] }) {
    const [boosters, setBoosters] = useState(initial);
    return <BoosterList boosters={boosters} detectedAccelerator={null} onChange={setBoosters} />;
  }

  function renderStateful(initial: PlanBooster[]) {
    render(
      <MemoryRouter>
        <StatefulList initial={initial} />
      </MemoryRouter>
    );
  }

  it("moves focus to the previous row's Remove button", async () => {
    const user = userEvent.setup();
    renderStateful([ROW({ bonus: 3 }), ROW({ bonus: 6 })]);

    await user.click(screen.getByRole('button', { name: 'Remove accelerator 2' }));

    expect(screen.getByRole('button', { name: 'Remove accelerator 1' })).toHaveFocus();
  });

  it('moves focus to Add accelerator when the first row goes', async () => {
    const user = userEvent.setup();
    renderStateful([ROW({ bonus: 3 }), ROW({ bonus: 6 })]);

    await user.click(screen.getByRole('button', { name: 'Remove accelerator 1' }));

    expect(screen.getByRole('button', { name: 'Add accelerator' })).toHaveFocus();
  });
});

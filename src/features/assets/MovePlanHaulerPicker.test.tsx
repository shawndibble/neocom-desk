import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { HaulerOption, MovePlan } from '@/engine/assets/movePlan';
import { HaulerPicker } from './MovePlanHaulerPicker';

const option = (typeId: number, name: string, capacityM3: number): HaulerOption => ({
  hull: {
    typeId,
    name,
    hullClass: 'Industrial',
    capacityM3,
    holds: [{ kind: 'cargo', capacityM3 }],
    owned: false,
    canFly: true,
  },
  trips: 1,
  pickups: [],
  unfitCount: 0,
  overLimitCount: 0,
  tooBigCount: 0,
});

const badger = option(648, 'Badger', 4800);
const nereus = option(650, 'Nereus', 2600);
const plan = {
  totals: { totalM3: 1200 },
  suggested: badger,
  active: badger,
  comparison: [badger, nereus],
} as unknown as MovePlan;

const pickOption = (name: string) => userEvent.click(screen.getByRole('radio', { name }));

describe('HaulerPicker', () => {
  it('tags the suggested hull and says what each one cannot carry', () => {
    const short = { ...nereus, unfitCount: 2 };
    const p = { ...plan, comparison: [badger, short] } as unknown as MovePlan;
    render(<HaulerPicker plan={p} override={undefined} onPick={vi.fn()} />);
    expect(screen.getByText('Suggested')).toBeTruthy();
    expect(screen.getByText("Can't carry 2 stacks")).toBeTruthy();
    expect(screen.getByText('Carries everything')).toBeTruthy();
  });

  it('shows the first four hulls, the chosen one too, and the rest on request', async () => {
    const many = [badger, nereus, option(1, 'C', 1), option(2, 'D', 1), option(3, 'E', 1)];
    const p = { ...plan, comparison: many } as unknown as MovePlan;
    const onToggle = vi.fn();
    const { rerender } = render(
      <HaulerPicker plan={p} override={undefined} onPick={vi.fn()} onToggleExpanded={onToggle} />
    );
    expect(screen.queryByRole('radio', { name: 'E' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    expect(onToggle).toHaveBeenCalled();
    rerender(
      <HaulerPicker
        plan={p}
        override={undefined}
        onPick={vi.fn()}
        expanded
        onToggleExpanded={onToggle}
      />
    );
    expect(screen.getByRole('radio', { name: 'E' })).toBeTruthy();
  });

  it('picks another hull, and the suggested one clears the override', async () => {
    const onPick = vi.fn();
    render(<HaulerPicker plan={plan} override={undefined} onPick={onPick} />);
    await pickOption('Nereus');
    expect(onPick).toHaveBeenLastCalledWith({ hullTypeId: 650 });
  });

  it('picking the suggested hull clears the override', async () => {
    const onPick = vi.fn();
    const onNereus = { ...plan, active: nereus } as unknown as MovePlan;
    render(<HaulerPicker plan={onNereus} override={{ hullTypeId: 650 }} onPick={onPick} />);
    await pickOption('Badger');
    expect(onPick).toHaveBeenLastCalledWith(undefined);
  });

  it('custom m³ seeds from the active capacity and applies what is typed', async () => {
    const onPick = vi.fn();
    render(<HaulerPicker plan={plan} override={undefined} onPick={onPick} />);
    await pickOption('Custom m³…');
    expect(onPick).toHaveBeenLastCalledWith({ customM3: 4800 });
    const field = screen.getByRole('textbox', { name: 'Cargo space in m³' });
    await userEvent.clear(field);
    await userEvent.type(field, '1500');
    expect(onPick).toHaveBeenLastCalledWith({ customM3: 1500 });
  });

  it('refuses a size that needs over 10,000 hauls and says the minimum', async () => {
    const onPick = vi.fn();
    render(<HaulerPicker plan={plan} override={{ customM3: 500 }} onPick={onPick} />);
    const field = screen.getByRole('textbox', { name: 'Cargo space in m³' });
    await userEvent.clear(field);
    await userEvent.type(field, '0.01');
    expect(screen.getByRole('alert').textContent).toBe(
      'Too small for this load. Use at least 1 m³.'
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each(['', '0', 'abc'])('rejects %j inline and never picks it', async (bad) => {
    const onPick = vi.fn();
    render(<HaulerPicker plan={plan} override={{ customM3: 500 }} onPick={onPick} />);
    const field = screen.getByRole('textbox', { name: 'Cargo space in m³' });
    await userEvent.clear(field);
    if (bad) await userEvent.type(field, bad);
    expect(screen.getByRole('alert').textContent).toBe('Enter a number above 0.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(onPick).not.toHaveBeenCalled();
  });
  it('marks owned hulls with their jumps', async () => {
    const owned = {
      ...nereus,
      hull: {
        ...nereus.hull,
        owned: true,
        ownedAt: { systemId: 30000142, jumps: 4, characterName: 'Alice' },
      },
    };
    const ownedPlan = { ...plan, comparison: [badger, owned] } as unknown as MovePlan;
    render(<HaulerPicker plan={ownedPlan} override={undefined} onPick={vi.fn()} />);
    expect(screen.getByText('Owned · 4 jumps')).toBeTruthy();
  });
});

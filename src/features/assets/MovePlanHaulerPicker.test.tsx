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

const pickOption = async (name: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: 'Hauler' }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('HaulerPicker', () => {
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
    await pickOption('Badger (suggested)');
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
});

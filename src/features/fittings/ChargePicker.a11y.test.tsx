import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { ChargeChoice } from '@/engine/fittings/chargeChoice';
import { ChargeChart } from './ChargeChart';
import { ChargePickerGroup } from './ChargePicker';
import { DEFAULT_PICKER_SETTINGS } from './chargePickerSettings';
import type { WeaponChargeGroup } from './useChargeChoices';

const base: ChargeChoice = {
  typeId: 1,
  name: 'EMP S',
  baseTypeId: 1,
  baseName: 'EMP S',
  tier: 'tech1',
  faction: null,
  dps: 100,
  optimal: 5000,
  falloff: 1000,
  damage: null,
  price: 10,
  roundsPerMinute: 10,
  cargo: 0,
  skillMissing: false,
};
const faction: ChargeChoice = {
  ...base,
  typeId: 2,
  name: 'Caldari Navy EMP S',
  tier: 'faction',
  faction: 'Caldari Navy',
  baseTypeId: 1,
  price: 500,
  cargo: 1535,
};
const choices = [base, faction];

describe('charge picker accessible names', () => {
  it('names a row after the details it shows', () => {
    const group: WeaponChargeGroup = {
      moduleTypeId: 1,
      slot: 'high',
      count: 1,
      loaded: new Set(),
      isWeapon: true,
      isCapBooster: false,
      isMiner: false,
      choices,
    } as WeaponChargeGroup;
    render(
      <ChargePickerGroup
        group={group}
        settings={DEFAULT_PICKER_SETTINGS}
        onLoad={() => {}}
        pricesLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^EMP, / }));
    const row = screen.getByRole('button', { name: /in cargo.*over 10× the Tech I cost/i });
    expect(row.getAttribute('aria-label')).toMatch(/\/min/);
    expect(row.getAttribute('aria-label')).toMatch(/Same as Tech I, costs more/);
    expect(row.querySelector('[role="img"]')).toBeNull();
  });
});

describe('ChargeChart', () => {
  it('is a group, not an image, so its focusable marks stay exposed', () => {
    const { container } = render(
      <ChargeChart choices={choices} distance={null} loaded={new Set()} gunCount={1} />
    );
    expect(
      screen.getByRole('group', { name: 'Charges plotted by optimal range and damage' })
    ).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('role')).not.toBe('img');
  });
});

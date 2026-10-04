import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { HaulingCargoControl } from './HaulingCargoControl';

vi.mock('@/features/fittings/useFittingCatalogue', () => ({ useFittingCatalogue: () => null }));
vi.mock('@/features/fittings/fittingPilotProfile', () => ({
  usePilotProfile: () => ({ profile: null }),
}));

async function openCustomTab() {
  const user = userEvent.setup();
  const onCargoChange = vi.fn();
  render(
    <HaulingCargoControl
      characterId={null}
      cargo={null}
      onCargoChange={onCargoChange}
      budget={null}
      onBudgetChange={() => {}}
    />
  );
  await user.click(screen.getByRole('button', { name: 'Cargo space' }));
  await user.click(screen.getByRole('button', { name: 'Enter m³' }));
  return { user, onCargoChange };
}

describe('HaulingCargoControl, a typed Cargo Space', () => {
  it('is one Any item hold by default', async () => {
    const { user, onCargoChange } = await openCustomTab();
    expect(screen.getByRole('combobox', { name: 'Takes' })).toHaveTextContent('Any item');
    await user.type(screen.getByRole('textbox', { name: 'Cargo space (m³)' }), '12400');
    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(onCargoChange).toHaveBeenCalledWith({
      label: 'Custom',
      holds: [{ kind: 'general', capacityM3: 12_400 }],
    });
  });

  it('offers each hold kind, and a typed hold of a kind only takes what that kind accepts', async () => {
    const { user, onCargoChange } = await openCustomTab();
    await user.click(screen.getByRole('combobox', { name: 'Takes' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent?.replace('✓', ''))).toEqual([
      'Any item',
      'Command center hold',
      'Mineral hold',
      'Gas hold',
      'Ice hold',
      'Fuel bay',
      'Ammo hold',
      'Planetary commodities hold',
      'Mining hold',
      'Infrastructure hold',
    ]);
    await user.click(screen.getByRole('option', { name: 'Ammo hold' }));
    await user.type(screen.getByRole('textbox', { name: 'Cargo space (m³)' }), '41000');
    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(onCargoChange).toHaveBeenCalledWith({
      label: 'Ammo hold',
      holds: [{ kind: 'ammo', capacityM3: 41_000 }],
    });
  });
});

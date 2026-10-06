import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useCadence, DEFAULT_PI_CADENCE } from '@/features/pi/cadencePref';
import { PiHeaderStrip } from '@/features/pi/PiHeaderStrip';
import { DEFAULT_PI_SETTINGS, usePiSettings } from '@/features/pi/piSettings';
import { PiSettingsForm } from './PiSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
  useCadence.setState({ value: DEFAULT_PI_CADENCE, hydrated: false });
});

function both() {
  return render(
    <>
      <PiHeaderStrip colonySystemIds={[]} estimate={false} />
      <PiSettingsForm />
    </>
  );
}

describe('PiSettingsForm', () => {
  it('shows the sell market, buy tiers and cadence, with buying off by default', async () => {
    render(<PiSettingsForm />);
    const tiers = await screen.findByRole('group', { name: 'Buy at the hub when short' });
    for (const tier of ['P1', 'P2', 'P3']) {
      expect(within(tiers).getByRole('button', { name: tier })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    }
    expect(screen.queryByRole('combobox', { name: 'Where do you sell?' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Restart extractors every' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Haul every' })).toBeInTheDocument();
  });

  it('toggles tiers from the keyboard and stores them, in tier order', async () => {
    const user = userEvent.setup();
    render(<PiSettingsForm />);
    const tiers = await screen.findByRole('group', { name: 'Buy at the hub when short' });
    const p3 = within(tiers).getByRole('button', { name: 'P3' });
    p3.focus();
    await user.keyboard('{Enter}');
    await user.click(within(tiers).getByRole('button', { name: 'P2' }));
    expect(usePiSettings.getState().value.buyTiers).toEqual([2, 3]);
    await user.click(p3);
    expect(usePiSettings.getState().value.buyTiers).toEqual([2]);
    await waitFor(async () =>
      expect((await db.settings.get('piSettings'))?.value).toMatchObject({ buyTiers: [2] })
    );
  });

  it('offers the sell market only where asked, under the strip label', async () => {
    render(<PiSettingsForm sellAt />);
    expect(await screen.findByRole('combobox', { name: 'Where do you sell?' })).toHaveTextContent(
      'Jita'
    );
  });

  it('leaves one sell control with the strip and the form side by side', async () => {
    both();
    await screen.findByRole('group', { name: 'Buy at the hub when short' });
    expect(screen.getAllByRole('combobox', { name: 'Where do you sell?' })).toHaveLength(1);
  });

  it('keeps the form and the header strip on one setting', async () => {
    const user = userEvent.setup();
    both();
    const strip = await screen.findByTestId('pi-header-strip');
    const stripSellAt = within(strip).getByRole('combobox', { name: 'Where do you sell?' });
    await act(() => usePiSettings.getState().setValue({ ...DEFAULT_PI_SETTINGS, hub: 'amarr' }));
    expect(stripSellAt).toHaveTextContent('Amarr');
    await user.click(screen.getByRole('button', { name: 'P2' }));
    expect(usePiSettings.getState().value).toMatchObject({ hub: 'amarr', buyTiers: [2] });
  });
});

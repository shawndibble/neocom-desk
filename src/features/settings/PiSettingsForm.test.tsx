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
    expect(screen.getByRole('combobox', { name: 'Sell at' })).toHaveTextContent('Jita');
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

  it('keeps the form and the header strip on one setting, whichever edits it', async () => {
    const user = userEvent.setup();
    both();
    const strip = await screen.findByTestId('pi-header-strip');
    const stripSellAt = within(strip).getByRole('combobox', { name: 'Where do you sell?' });
    const formSellAt = await screen.findByRole('combobox', { name: 'Sell at' });
    expect(stripSellAt).toHaveTextContent('Jita');

    // A change from the form shows in the strip...
    await act(() => usePiSettings.getState().setValue({ ...DEFAULT_PI_SETTINGS, hub: 'amarr' }));
    expect(stripSellAt).toHaveTextContent('Amarr');
    expect(formSellAt).toHaveTextContent('Amarr');

    // ...and a corp buyback set from the strip shows in the form, rate included.
    await act(() =>
      usePiSettings.getState().setValue({ ...usePiSettings.getState().value, buybackPct: 85 })
    );
    expect(stripSellAt).toHaveTextContent('My corp buyback');
    expect(formSellAt).toHaveTextContent('My corp buyback');
    expect(within(strip).getByRole('combobox', { name: 'Buyback rate' })).toHaveTextContent(
      '85% of Amarr'
    );
    expect(
      screen
        .getAllByRole('combobox', { name: 'Buyback rate' })
        .filter((box) => !strip.contains(box))[0]
    ).toHaveTextContent('85% of Amarr');

    // The tier chips and the strip read the same record too.
    await user.click(screen.getByRole('button', { name: 'P2' }));
    expect(usePiSettings.getState().value).toMatchObject({ hub: 'amarr', buyTiers: [2] });
  });
});

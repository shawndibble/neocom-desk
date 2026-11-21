import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import {
  useBpcHideAuctionsDefault,
  useBpcHidePlexDefault,
} from '@/features/bpcContracts/sourcingDefaults';
import { useMarketHub } from '@/features/market/hub';
import { usePageHubs } from '@/features/market/pageHubs';
import { BpcSourcingSettingsForm } from './BpcSourcingSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useBpcHideAuctionsDefault.setState({ value: false, hydrated: false });
  useBpcHidePlexDefault.setState({ value: false, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
});

describe('BpcSourcingSettingsForm', () => {
  it('sets where BPC Sourcing starts', async () => {
    const user = userEvent.setup();
    render(<BpcSourcingSettingsForm />);

    await user.click(await screen.findByRole('checkbox', { name: 'Hide auctions' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hide PLEX contracts' }));

    expect(useBpcHideAuctionsDefault.getState().value).toBe(true);
    expect(useBpcHidePlexDefault.getState().value).toBe(true);
  });

  it('sets the market hub BPC Sourcing checks: the Industry page hub, here on Global', async () => {
    const user = userEvent.setup();
    render(<BpcSourcingSettingsForm />);

    await user.click(await screen.findByRole('button', { name: /Market hub/ }));
    // Industry prices materials it buys, so its popover carries a Buy percent (issue #6531).
    expect(screen.getByRole('spinbutton', { name: 'Buy percent' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Amarr VIII' }));

    // On Global, so the pick moves the Global hub.
    await waitFor(() => expect(useMarketHub.getState().value).toBe('amarr'));
  });
});

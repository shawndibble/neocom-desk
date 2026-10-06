import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { PiHeaderStrip } from './PiHeaderStrip';
import { DEFAULT_PI_SETTINGS, usePiSettings } from './piSettings';

beforeEach(async () => {
  await db.settings.clear();
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
});

function renderStrip(props: Parameters<typeof PiHeaderStrip>[0]) {
  return render(
    <MemoryRouter>
      <PiHeaderStrip {...props} />
    </MemoryRouter>
  );
}

describe('PiHeaderStrip', () => {
  it('labels the route measure the home route, so it is not read as the Hauling figure', () => {
    usePiSettings.setState({ value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 }, hydrated: true });
    renderStrip({ colonySystemIds: [30000142], estimate: false });
    const strip = screen.getByTestId('pi-header-strip');
    expect(within(strip).getByText('Home route')).toBeInTheDocument();
    expect(within(strip).queryByText('Route')).not.toBeInTheDocument();
  });

  it('has exactly one Sell at control with its settings modal open', async () => {
    const user = userEvent.setup();
    renderStrip({ colonySystemIds: [], estimate: true });
    await user.click(await screen.findByRole('button', { name: 'PI settings' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('group', { name: 'Buy at the hub when short' });
    expect(screen.getAllByRole('combobox', { name: 'Where do you sell?' })).toHaveLength(1);
  });

  it('puts the Est. badge on a price note with a hint, not after the drop-off line', async () => {
    usePiSettings.setState({ value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 }, hydrated: false });
    renderStrip({ colonySystemIds: [], estimate: true });
    const strip = await screen.findByTestId('pi-header-strip');
    const note = within(strip).getByText('Estimated prices');
    expect(note).toHaveAttribute('tabindex', '0');
    expect(note.parentElement).toHaveTextContent(/est\.\s*estimated prices/i);
  });

  it('shows no estimate note on tabs without projections', async () => {
    renderStrip({ colonySystemIds: [], estimate: false });
    await screen.findByTestId('pi-header-strip');
    expect(screen.queryByText('Estimated prices')).not.toBeInTheDocument();
  });
});

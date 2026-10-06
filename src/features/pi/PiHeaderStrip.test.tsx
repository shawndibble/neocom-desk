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

describe('PiHeaderStrip', () => {
  it('has exactly one Sell at control with its settings modal open', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PiHeaderStrip colonySystemIds={[]} estimate />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'More market settings' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('group', { name: 'Buy at the hub when short' });
    expect(screen.getAllByRole('combobox', { name: 'Where do you sell?' })).toHaveLength(1);
  });

  it('puts the Est. badge on a price note with a hint, not after the drop-off line', async () => {
    usePiSettings.setState({
      value: { ...DEFAULT_PI_SETTINGS, buybackPct: 85 },
      hydrated: false,
    });
    render(<PiHeaderStrip colonySystemIds={[]} estimate />);
    const strip = await screen.findByTestId('pi-header-strip');
    const note = within(strip).getByText('Prices');
    expect(note).toHaveAttribute('tabindex', '0');
    expect(note.parentElement).toHaveTextContent(/est\.\s*prices/i);
  });

  it('shows no estimate note on tabs without projections', async () => {
    render(<PiHeaderStrip colonySystemIds={[]} estimate={false} />);
    await screen.findByTestId('pi-header-strip');
    expect(screen.queryByText('Prices')).not.toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { AVOIDED_SYSTEMS_KEY, useAvoidedSystems } from '@/features/route/avoidedSystems';
import { AvoidedSystemsPanel } from './AvoidedSystemsPanel';

const SYSTEMS: SolarSystemEntry[] = [
  { id: 30002813, name: 'Tama', security: 0.3, regionId: 10000069 },
  { id: 30045328, name: 'Uedama', security: 0.5, regionId: 10000033 },
  { id: 30000142, name: 'Jita', security: 0.95, regionId: 10000002 },
];

vi.mock('@/sde/loadMarketSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadMarketSde')>();
  return { ...actual, loadSolarSystems: async () => SYSTEMS };
});

beforeEach(async () => {
  await db.settings.clear();
  useAvoidedSystems.setState({ value: [], hydrated: false });
});

describe('AvoidedSystemsPanel', () => {
  it('lists stored systems by name with their security status', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [30045328, 30002813] });
    render(<AvoidedSystemsPanel />);

    const list = await screen.findByRole('list', { name: 'Avoided systems' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((row) => row.textContent)
      ).toEqual(['Tama0.3', 'Uedama0.5'])
    );
  });

  it('adds a system from the search, showing security in the results', async () => {
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add an avoided system' }));
    await user.type(screen.getByRole('combobox'), 'ued');
    const option = await screen.findByRole('option', { name: /Uedama/ });
    expect(option).toHaveTextContent('0.5');
    await user.click(option);

    const list = await screen.findByRole('list', { name: 'Avoided systems' });
    expect(list).toHaveTextContent('Uedama0.5');
    expect(useAvoidedSystems.getState().value).toEqual([30045328]);
  });

  it('leaves systems already avoided out of the search', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [30045328] });
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Add an avoided system' }));
    await user.type(screen.getByRole('combobox'), 'a');
    await screen.findByRole('option', { name: /Tama/ });
    expect(screen.queryByRole('option', { name: /Uedama/ })).not.toBeInTheDocument();
  });

  it('removes a system', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [30045328, 30002813] });
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove Uedama' }));

    expect(useAvoidedSystems.getState().value).toEqual([30002813]);
    expect(screen.getByRole('list', { name: 'Avoided systems' })).not.toHaveTextContent('Uedama');
  });

  it('still lists, and can remove, a system the snapshot cannot name', async () => {
    await db.settings.put({ key: AVOIDED_SYSTEMS_KEY, value: [99999999] });
    const user = userEvent.setup();
    render(<AvoidedSystemsPanel />);

    await user.click(await screen.findByRole('button', { name: 'Remove #99999999' }));

    expect(await screen.findByText('No systems avoided yet.')).toBeInTheDocument();
  });
});

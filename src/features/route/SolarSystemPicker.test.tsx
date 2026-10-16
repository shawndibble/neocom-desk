import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SolarSystemPicker } from './SolarSystemPicker';

const sde = vi.hoisted(() => ({ loadSolarSystems: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadSolarSystems: sde.loadSolarSystems }));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => null,
  lookupSolarSystem: async () => null,
}));

const JITA = { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 };

beforeEach(() => sde.loadSolarSystems.mockReset());

describe('SolarSystemPicker', () => {
  it('says the system list could not load, with Retry, instead of rendering nothing', async () => {
    sde.loadSolarSystems.mockRejectedValueOnce(new Error('offline'));
    render(<SolarSystemPicker value={null} onChange={() => {}} ariaLabel="Pick system" />);
    await userEvent.click(screen.getByRole('button', { name: 'Pick system' }));
    expect(await screen.findAllByText("System list couldn't load")).not.toHaveLength(0);

    sde.loadSolarSystems.mockResolvedValueOnce([JITA]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.type(screen.getByRole('combobox'), 'Jit');
    expect(await screen.findByRole('option', { name: /Jita/ })).toBeInTheDocument();
    expect(screen.queryByText("System list couldn't load")).not.toBeInTheDocument();
  });
});

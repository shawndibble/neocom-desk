import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import {
  clearPodKillsLoad,
  ROUTE_RULE_STORES,
  useAvoidEdencom,
  useAvoidPodKills,
  useDefaultRoutePreference,
  usePodKillThreshold,
  useSecurityPenalty,
} from '@/features/route/routeRules';
import { useRouteHolesEnabled } from '@/features/route/routeHoleSettings';
import { TravelSettingsPanel } from './TravelSettingsPanel';

const loadPodKills = vi.fn<() => Promise<ReadonlyMap<number, number> | null>>();
vi.mock('@/features/travel/routeSafetyData', () => ({ loadPodKills: () => loadPodKills() }));
vi.mock('@/sde/loadMarketSde', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/sde/loadMarketSde')>();
  return { ...actual, loadSolarSystems: async () => [] };
});

beforeEach(async () => {
  await db.settings.clear();
  for (const store of ROUTE_RULE_STORES) {
    (store.setState as (partial: { hydrated: boolean }) => void)({ hydrated: false });
  }
  useDefaultRoutePreference.setState({ value: 'prefer-highsec' });
  useSecurityPenalty.setState({ value: 50 });
  useAvoidEdencom.setState({ value: false });
  useAvoidPodKills.setState({ value: false });
  usePodKillThreshold.setState({ value: 3 });
  clearPodKillsLoad();
  loadPodKills.mockReset().mockResolvedValue(new Map());
});

describe('TravelSettingsPanel', () => {
  it("offers Route Safety's wormhole rules, saved as the default every jump count follows", async () => {
    const user = userEvent.setup();
    render(<TravelSettingsPanel />);

    const holes = await screen.findByRole('checkbox', { name: /Route through Thera/ });
    expect(holes).not.toBeChecked();
    await user.click(holes);

    expect(useRouteHolesEnabled.getState().value).toBe(true);
    expect(screen.getByRole('checkbox', { name: /jump bridges/i })).toBeInTheDocument();
  });

  it('opens on the stored default and changes it', async () => {
    const user = userEvent.setup();
    render(<TravelSettingsPanel />);

    const preference = await screen.findByRole('combobox', { name: 'Default route preference' });
    expect(preference).toHaveTextContent('Prefer safer');
    await user.click(preference);
    await user.click(await screen.findByRole('option', { name: 'Prefer less secure' }));

    expect(useDefaultRoutePreference.getState().value).toBe('avoid-highsec');
  });

  it('keeps the security penalty to the game range, and off for Prefer shorter', async () => {
    const user = userEvent.setup();
    render(<TravelSettingsPanel />);

    const penalty = await screen.findByRole('spinbutton', { name: 'Security penalty' });
    await user.clear(penalty);
    await user.type(penalty, '250');
    expect(useSecurityPenalty.getState().value).toBe(100);

    await user.click(screen.getByRole('combobox', { name: 'Default route preference' }));
    await user.click(await screen.findByRole('option', { name: 'Prefer shorter' }));
    expect(screen.getByRole('spinbutton', { name: 'Security penalty' })).toBeDisabled();
  });

  it('switches the EDENCOM rule, naming how many systems it covers', async () => {
    const user = userEvent.setup();
    render(<TravelSettingsPanel />);

    await user.click(
      await screen.findByRole('checkbox', { name: /EDENCOM systems \(137 systems\)/ })
    );

    expect(useAvoidEdencom.getState().value).toBe(true);
  });

  it('says so when pod-kill avoidance is on but the kill report cannot be read', async () => {
    loadPodKills.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<TravelSettingsPanel />);

    const threshold = await screen.findByRole('spinbutton', {
      name: 'Pod kills in the last hour that count as recent',
    });
    expect(threshold).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Systems with recent pod kills' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/kill report/));
    expect(threshold).toBeEnabled();
  });
});

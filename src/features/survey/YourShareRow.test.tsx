import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { summarizeSurvey } from '@/engine/survey/series';

const { loadCharacterSolarSystemId, loadSystemName, loadMiningLedger, resolveSolarSystem } =
  vi.hoisted(() => ({
    loadCharacterSolarSystemId: vi.fn(),
    loadSystemName: vi.fn(),
    loadMiningLedger: vi.fn(),
    resolveSolarSystem: vi.fn(),
  }));
vi.mock('@/features/character/location', () => ({ loadCharacterSolarSystemId }));
vi.mock('@/features/character/systemSecurity', () => ({ loadSystemName }));
vi.mock('@/features/miningTax/ledger', () => ({ loadMiningLedger }));
vi.mock('@/features/character/systemLookup', () => ({ resolveSolarSystem }));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({ '1': { name: 'Veldspar', groupID: 18, volume: 0.1 } }),
}));

import { useSurveySystem } from './surveySystemPref';
import { YourShareRow } from './YourShareRow';

const T0 = Date.UTC(2026, 9, 8, 18);
// 2,000 m3 of Veldspar, then 1,000 left: the survey shows 1,000 m3 mined.
const summary = summarizeSurvey([
  { at: T0, rocks: [{ ore: 'Veldspar', volume: 2000 }] },
  { at: T0 + 600_000, rocks: [{ ore: 'Veldspar', volume: 1000 }] },
])!;

const JITA = 30000142;
const ledger = (quantity: number, system = JITA) => ({
  cached: { data: [{ date: '2026-10-08', quantity, solar_system_id: system, type_id: 1 }] },
});

beforeEach(async () => {
  loadCharacterSolarSystemId.mockReset().mockResolvedValue(JITA);
  loadSystemName.mockReset().mockResolvedValue('Jita');
  loadMiningLedger.mockReset().mockResolvedValue(ledger(2000));
  resolveSolarSystem.mockReset();
  await useSurveySystem.getState().setValue(null);
});

afterEach(cleanup);

describe('YourShareRow', () => {
  it("reads the pilot's current system and shows their share of what the survey says is mined", async () => {
    render(<YourShareRow characterId={7} summary={summary} />);
    // 2,000 units at 0.1 m3 is 200 m3, a fifth of the 1,000 m3 mined.
    await screen.findByText(/You mined 200 m³ of these ores in Jita/);
    expect(screen.getByText(/20% of what's been mined/)).toBeTruthy();
    expect(loadMiningLedger).toHaveBeenCalledWith(7);
  });

  it('prefers the system the pilot chose over where they are', async () => {
    await useSurveySystem.getState().setValue({ id: 30002187, name: 'Amarr' });
    loadMiningLedger.mockResolvedValue(ledger(5000, 30002187));
    render(<YourShareRow characterId={7} summary={summary} />);
    await screen.findByText(/You mined 500 m³ of these ores in Amarr/);
  });

  it('asks for the system when the location is unknown, and uses the one the pilot names', async () => {
    loadCharacterSolarSystemId.mockResolvedValue(null);
    resolveSolarSystem.mockResolvedValue({ id: JITA, name: 'Jita', security: null });
    render(<YourShareRow characterId={7} summary={summary} />);
    const input = await screen.findByLabelText('Solar system');
    fireEvent.change(input, { target: { value: 'jita' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText(/You mined 200 m³ of these ores in Jita/);
    expect(useSurveySystem.getState().value).toEqual({ id: JITA, name: 'Jita' });
  });

  it('says so when no system has that name', async () => {
    loadCharacterSolarSystemId.mockResolvedValue(null);
    resolveSolarSystem.mockResolvedValue(null);
    render(<YourShareRow characterId={7} summary={summary} />);
    const input = await screen.findByLabelText('Solar system');
    fireEvent.change(input, { target: { value: 'Nowhere' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toContain('No system by that name');
  });

  it('shows nothing when the mining ledger cannot be read', async () => {
    loadMiningLedger.mockResolvedValue({ cached: null, needsReauth: true });
    const { container } = render(<YourShareRow characterId={7} summary={summary} />);
    await waitFor(() => expect(loadMiningLedger).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});

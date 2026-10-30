import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { useDefaultMarketHub } from '@/features/market/hub';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { readServerInputs } from './serverEventInputs';

vi.mock('./pollDomains/priceAlerts', async (importActual) => ({
  ...(await importActual<typeof import('./pollDomains/priceAlerts')>()),
  targetedQuickbarItems: vi.fn(async () => [
    { typeId: 34, name: 'Tritanium', targetPrice: 5, targetDirection: 'below' },
  ]),
}));

describe('readServerInputs', () => {
  beforeEach(() => {
    useDefaultMarketHub.setState({ value: 'jita', hydrated: true });
    useHubByCharacter.setState({ value: { 1: 'hek', 2: 'amarr' }, hydrated: true });
    useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true });
  });

  it("sends the polled character's hub station while another is active", async () => {
    const inputs = await readServerInputs(1, ['priceAlertTriggered']);
    expect(inputs.priceStationId).toBe(60005686);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { useDefaultMarketHub } from '@/features/market/hub';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { currentHub } from './priceAlerts';

describe('currentHub', () => {
  beforeEach(() => {
    useDefaultMarketHub.setState({ value: 'jita', hydrated: true });
    useHubByCharacter.setState({ value: { 1: 'hek', 2: 'amarr' }, hydrated: true });
    useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true });
  });

  it("uses the polled character's own hub while another is active", async () => {
    expect((await currentHub(1)).id).toBe('hek');
  });

  it('falls back to the account default for a character with no entry', async () => {
    expect((await currentHub(3)).id).toBe('jita');
  });
});

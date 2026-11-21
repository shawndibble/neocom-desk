import { useDefaultMarketHub, useMarketHub } from '@/features/market/hub';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { usePageHubs } from '@/features/market/pageHubs';
import { useActiveCharacter } from '@/stores/activeCharacter';

/**
 * Puts every Trade Hub store back to unread (Global Jita, no page hubs), so a
 * hub one test picked never leaks into the next. Call after clearing
 * `db.settings`; the stores then read it again on first use.
 */
export function resetHubStores(): void {
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
}

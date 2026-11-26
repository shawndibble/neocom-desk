import { useDefaultMarketHub, useGlobalClosest, useMarketHub } from '@/features/market/hub';
import { resetClosestHubs } from '@/features/market/closestHub';
import { useHubByCharacter } from '@/features/market/characterHubs';
import { usePageHubs, useParkedPageHubs } from '@/features/market/pageHubs';
import { usePagePricePercents } from '@/features/market/pagePricePercents';
import { useMarketPricePercent } from '@/features/market/pricePercent';
import { DEFAULT_PI_SETTINGS, usePiSettings } from '@/features/pi/piSettings';
import { useActiveCharacter } from '@/stores/activeCharacter';

export function resetHubStores(): void {
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
  useParkedPageHubs.setState({ value: {}, hydrated: false });
  useGlobalClosest.setState({ value: false, hydrated: false });
  usePagePricePercents.setState({ value: {}, hydrated: false });
  useMarketPricePercent.setState({ value: 100, hydrated: false });
  usePiSettings.setState({ value: DEFAULT_PI_SETTINGS, hydrated: false });
  resetClosestHubs();
}

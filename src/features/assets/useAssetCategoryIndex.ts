import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadMarketGroups } from '@/sde/loadMarketSde';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { buildCategoryIndex, type AssetCategoryIndex } from './assetCategoryFilter';

export function useAssetCategoryIndex(enabled: boolean): AssetCategoryIndex | null {
  const { t } = useTranslation();
  const notOnMarket = t('assets.category.notOnMarket');
  const loader = useMemo(
    () => async () => {
      const [groups, typesById] = await Promise.all([loadMarketGroups(), loadMarketTypesById()]);
      return buildCategoryIndex(groups, typesById.values(), notOnMarket);
    },
    [notOnMarket]
  );
  const { data } = useKeyedLoad(enabled ? 'asset-categories' : null, loader);
  return data ?? null;
}

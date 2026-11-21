import { useTranslation } from 'react-i18next';
import { HubField } from '@/features/market/HubMenu';
import type { PageHubArea } from '@/features/market/pageHubs';
import { STAT_FIELD_WIDTH } from './statKit';

/**
 * The Trade Hub a Fittings or Skills price section quotes: its page area's
 * hub (`HubField`), Global unless the pilot gave the area a hub of its own.
 * Both pages price what the pilot buys, so the popover's percent is a Buy percent.
 */
export function PriceHubSelect({
  area = 'fittings',
  size = 'md',
  bare = false,
}: {
  area?: PageHubArea;
  size?: 'sm' | 'md';
  /** Just the field, for a caller that labels it itself (the stats column's `StatField`). */
  bare?: boolean;
} = {}) {
  const { t } = useTranslation();
  const field = (
    <HubField
      area={area}
      size={size}
      side="buy"
      label={t('fittings.stats.priceHub')}
      className={bare ? STAT_FIELD_WIDTH : 'min-w-0'}
    />
  );
  if (bare) return field;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-dim">{t('fittings.stats.priceHub')}</span>
      {field}
    </div>
  );
}

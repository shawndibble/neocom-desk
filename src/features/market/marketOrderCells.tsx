import { fixed1 } from '@/lib/fixedFormat';
import { HintText } from '@/components/ui/HintText';
import type { TFunction } from 'i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { securityStatusColor } from '@/engine/securityStatus';
import type { RegionOrder } from '@/esi/endpoints';
import { formatCount } from '@/lib/formatCount';

export interface LocationCellProps {
  order: RegionOrder;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  t: TFunction;
  card?: boolean;
}

export function LocationCell({
  order,
  npcStations,
  solarSystems,
  t,
  card = false,
}: LocationCellProps) {
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  if (location.stationName === null) {
    return <span>{t('market.unknownStructure')}</span>;
  }
  if (card) return <span className="block truncate">{location.stationName}</span>;
  return (
    <HintText content={location.stationName} desktopOnly>
      {location.stationName}
    </HintText>
  );
}

export function SecurityCell({ order, npcStations, solarSystems, t }: LocationCellProps) {
  const { security } = resolveOrderLocation(order, npcStations, solarSystems);
  const value = fixed1(security);
  return (
    <HintText
      content={t('market.securityAriaLabel', { value })}
      className="tabular-nums font-semibold"
    >
      <span style={{ color: securityStatusColor(security) }}>{value}</span>
    </HintText>
  );
}

export function BaitFlag({ multiple, t }: { multiple: number | null; t: TFunction }) {
  if (multiple === null) return null;
  const times = formatCount(multiple);
  return (
    <Tooltip content={t('market.baitHint', { times })}>
      <span
        tabIndex={0}
        role="img"
        aria-label={t('market.baitLabel')}
        className="mr-1 inline-flex align-text-bottom text-warning"
      >
        <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}

export function MyOrderMark({ t }: { t: TFunction }) {
  return (
    <span
      role="img"
      aria-label={t('market.myOrder')}
      className="mr-1 inline-flex align-text-bottom text-text"
    >
      <Icon.MyOrder aria-hidden size={Icon.ICON_SIZE.sm} />
    </span>
  );
}

/**
 * Planning mode's "Count what I own": the switch with Appraisal's place picker
 * (the one shared pick), and the row's cost line that names what is owned.
 */
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  IskAmount,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OWNED_EVERYWHERE } from '@/features/market/appraisalOwnedPref';
import type { OwnedScope } from '@/features/market/useOwnedAtStation';
import { TRADE_HUBS } from '@/market/hubs';

/** The drawer's owned-stock controls; absent when no Character has the assets scope. */
export interface ImproveOwnedSettings {
  on: boolean;
  onChange: (on: boolean) => void;
  /** The place counted: a station or structure id, or every location. */
  place: OwnedScope;
  onPlaceChange: (place: OwnedScope) => void;
  /** Places beyond the Trade Hubs that hold stock. */
  otherPlaces: readonly { id: number; label: string }[];
  /** The picked place's name, for the settings summary. */
  placeLabel: string;
}

export function OwnedStockControl({
  owned,
  noneHere,
}: {
  owned: ImproveOwnedSettings;
  /** Counting is on and nothing among the candidates is held at the place. */
  noneHere: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className={`flex items-center gap-2 text-sm ${tappableRowClassName}`}>
          <Checkbox checked={owned.on} onChange={(event) => owned.onChange(event.target.checked)} />
          {t('fittings.improve.owned.label')}
        </label>
        <Select
          disabled={!owned.on}
          value={owned.place === 'all' ? OWNED_EVERYWHERE : String(owned.place)}
          onValueChange={(value) =>
            owned.onPlaceChange(value === OWNED_EVERYWHERE ? 'all' : Number(value))
          }
        >
          <SelectTrigger
            size="sm"
            className="w-auto"
            aria-label={t('market.appraisal.minusOwnedStation')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OWNED_EVERYWHERE}>
              {t('market.appraisal.minusOwnedEverywhere')}
            </SelectItem>
            <SelectSeparator />
            {TRADE_HUBS.map((hub) => (
              <SelectItem key={hub.id} value={String(hub.stationId)}>
                {hub.systemName}
              </SelectItem>
            ))}
            {owned.otherPlaces.length > 0 && <SelectSeparator />}
            {owned.otherPlaces.map((place) => (
              <SelectItem key={place.id} value={String(place.id)}>
                {place.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {owned.on && noneHere && (
        <p className="text-warning text-xs">
          {t('fittings.improve.owned.noneHere', { place: owned.placeLabel })}
        </p>
      )}
    </div>
  );
}

/** The row's cost line while owned stock is counted: "You own 1 of 2 · buy 1 for 113.5M". */
export function OwnedCostLine({
  need,
  own,
  isk,
}: {
  /** Copies the swap puts on the fit. */
  need: number;
  /** Copies held at the place. */
  own: number;
  /** What is still to buy. */
  isk: number;
}) {
  const { t } = useTranslation();
  if (own >= need)
    return (
      <>
        <span className="text-success">{t('fittings.improve.owned.all', { count: need })}</span>
        <span className="text-text-dim"> · {t('fittings.improve.owned.nothingToBuy')}</span>
      </>
    );
  return (
    <>
      {t('fittings.improve.owned.some', { own, need, buy: need - own })}{' '}
      <IskAmount value={Math.max(0, isk)} />
    </>
  );
}

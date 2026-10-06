import { useTranslation } from 'react-i18next';
import {
  Field,
  Fields,
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { PI_CADENCE_DAYS, useCadence, type PiCadenceDays } from '@/features/pi/cadencePref';
import { useExpiringWindowHours, EXPIRING_WINDOW_HOUR_OPTIONS } from '@/features/pi/expiringWindow';
import {
  DEFAULT_BUYBACK_PCT,
  PI_BUYBACK_PCT_OPTIONS,
  PI_BUY_TIERS,
  usePiSettings,
  type PiBuyTier,
} from '@/features/pi/piSettings';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { ChipRow } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

const BUYBACK = 'buyback';

/**
 * Planetary Industry's settings: Settings → Industry, and the PI page's
 * settings modal. The sell market, what may be bought at the hub and the haul
 * cadence are read by every PI tab, and the page header's "Sell at" picker
 * edits the same record (`piSettings.ts`).
 */
export function PiSettingsForm() {
  const { t } = useTranslation();
  const expiringHours = useExpiringWindowHours((state) => state.value);
  const setExpiringHours = useExpiringWindowHours((state) => state.setValue);
  const settings = usePiSettings((state) => state.value);
  const setSettings = usePiSettings((state) => state.setValue);
  const cadence = useCadence((state) => state.value);
  const setCadence = useCadence((state) => state.setValue);
  const expiringHydrated = useHydratedStore(useExpiringWindowHours);
  const settingsHydrated = useHydratedStore(usePiSettings);
  const cadenceHydrated = useHydratedStore(useCadence);

  if (!expiringHydrated || !settingsHydrated || !cadenceHydrated) return <Spinner />;

  const hub = TRADE_HUBS.find((option) => option.id === settings.hub) ?? TRADE_HUBS[0];
  const toggleTier = (tier: PiBuyTier) =>
    void setSettings({
      ...settings,
      buyTiers: PI_BUY_TIERS.filter((each) =>
        each === tier ? !settings.buyTiers.includes(tier) : settings.buyTiers.includes(each)
      ),
    });
  const cadenceDays = (days: PiCadenceDays) => t('piAdvisor.cadenceDays', { count: days });

  return (
    <Fields variant="form">
      <Field
        label={t('settings.piSellAtLabel')}
        htmlFor="settings-pi-sell-at"
        note={t('settings.piSellAtHint')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={settings.buybackPct === null ? settings.hub : BUYBACK}
            onValueChange={(value) =>
              void setSettings(
                value === BUYBACK
                  ? {
                      ...settings,
                      buybackPct: settings.buybackPct ?? DEFAULT_BUYBACK_PCT,
                      hubChosen: true,
                    }
                  : { ...settings, hub: value as TradeHub['id'], buybackPct: null, hubChosen: true }
              )
            }
          >
            <SelectTrigger id="settings-pi-sell-at" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.systemName}
                </SelectItem>
              ))}
              <SelectItem value={BUYBACK}>{t('piPlan.strip.corpBuyback')}</SelectItem>
            </SelectContent>
          </Select>
          {settings.buybackPct !== null && (
            <Select
              value={String(settings.buybackPct)}
              onValueChange={(value) =>
                void setSettings({ ...settings, buybackPct: Number(value) })
              }
            >
              <SelectTrigger aria-label={t('piPlan.strip.buybackRate')} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...PI_BUYBACK_PCT_OPTIONS, settings.buybackPct])]
                  .sort((a, b) => a - b)
                  .map((pct) => (
                    <SelectItem key={pct} value={String(pct)}>
                      {t('piPlan.strip.buybackPct', { pct, hub: hub.systemName })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </Field>

      <Field label={t('settings.piBuyTiersLabel')} note={t('settings.piBuyTiersHint')}>
        <div role="group" aria-label={t('settings.piBuyTiersLabel')} className="flex gap-2">
          {PI_BUY_TIERS.map((tier) => (
            <FilterChip
              key={tier}
              label={t('piPlan.tierChip', { tier })}
              selected={settings.buyTiers.includes(tier)}
              onToggle={() => toggleTier(tier)}
            />
          ))}
        </div>
      </Field>

      <Field
        label={t('settings.piRestartLabel')}
        htmlFor="settings-pi-restart"
        note={t('settings.piRestartHint')}
      >
        <CadenceSelect
          id="settings-pi-restart"
          value={cadence.restartDays}
          labelFor={cadenceDays}
          onChange={(restartDays) => void setCadence({ ...cadence, restartDays })}
        />
      </Field>
      <Field
        label={t('settings.piHaulLabel')}
        htmlFor="settings-pi-haul"
        note={t('settings.piHaulHint')}
      >
        <CadenceSelect
          id="settings-pi-haul"
          value={cadence.haulDays}
          labelFor={cadenceDays}
          onChange={(haulDays) => void setCadence({ ...cadence, haulDays })}
        />
      </Field>

      <ChipRow
        label={t('settings.piExpiringLabel')}
        hint={t('settings.piExpiringHint')}
        options={EXPIRING_WINDOW_HOUR_OPTIONS}
        selected={expiringHours}
        onSelect={(hours) => void setExpiringHours(hours)}
        labelFor={(hours) => t('settings.hours', { count: hours })}
      />
    </Fields>
  );
}

function CadenceSelect({
  id,
  value,
  labelFor,
  onChange,
}: {
  id: string;
  value: PiCadenceDays;
  labelFor: (days: PiCadenceDays) => string;
  onChange: (days: PiCadenceDays) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next) as PiCadenceDays)}>
      <SelectTrigger id={id} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PI_CADENCE_DAYS.map((days) => (
          <SelectItem key={days} value={String(days)}>
            {labelFor(days)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

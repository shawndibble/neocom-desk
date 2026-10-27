import { useTranslation } from 'react-i18next';
import {
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from '@/components/ui';
import { type ChargeFilters, type ChargeSort } from '@/engine/fittings/chargeChoice';
import { type ChargePickerSettings, type ChargeView } from '../chargePickerSettings';

interface ControlsProps {
  settings: ChargePickerSettings;
  onChange: (next: ChargePickerSettings) => void;
  /** The slider's top end, km. */
  maxKm: number;
}

/** View and Sort, the filter chips, and "Fighting at"'s distance slider (shown only while it's on). */
export function ChargePickerControls({ settings, onChange, maxKm }: ControlsProps) {
  const { t } = useTranslation();
  const set = (patch: Partial<ChargePickerSettings>) => onChange({ ...settings, ...patch });
  const setFilter = (key: keyof ChargeFilters) =>
    set({ filters: { ...settings.filters, [key]: !settings.filters[key] } });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[0.6875rem] text-text-dim">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span>{t('fittings.chargePicker.view')}</span>
          <Select value={settings.view} onValueChange={(view) => set({ view: view as ChargeView })}>
            <SelectTrigger
              size="sm"
              aria-label={t('fittings.chargePicker.view')}
              className="min-w-0 flex-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="type">{t('fittings.chargePicker.viewType')}</SelectItem>
              <SelectItem value="faction">{t('fittings.chargePicker.viewFaction')}</SelectItem>
              <SelectItem value="chart">{t('fittings.chargePicker.viewChart')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span>{t('fittings.chargePicker.sort')}</span>
          <Select value={settings.sort} onValueChange={(sort) => set({ sort: sort as ChargeSort })}>
            <SelectTrigger
              size="sm"
              aria-label={t('fittings.chargePicker.sort')}
              className="min-w-0 flex-1"
              disabled={settings.view === 'chart'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="range">{t('fittings.chargePicker.sortRange')}</SelectItem>
              <SelectItem value="damage">{t('fittings.chargePicker.sortDamage')}</SelectItem>
              <SelectItem value="price">{t('fittings.chargePicker.sortPrice')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label={t('fittings.chargePicker.filterTech1')}
          tooltip={t('fittings.chargePicker.filterTech1Tip')}
          selected={settings.filters.tech1Only}
          onToggle={() => setFilter('tech1Only')}
        />
        <FilterChip
          label={t('fittings.chargePicker.filterCargo')}
          selected={settings.filters.inCargo}
          onToggle={() => setFilter('inCargo')}
        />
        <FilterChip
          label={t('fittings.chargePicker.filterUsable')}
          tooltip={t('fittings.chargePicker.filterUsableTip')}
          selected={settings.filters.usable}
          onToggle={() => setFilter('usable')}
        />
        <FilterChip
          label={t('fittings.chargePicker.fightingAt')}
          selected={settings.fightingAt}
          onToggle={() => set({ fightingAt: !settings.fightingAt })}
        />
      </div>
      {settings.fightingAt && (
        <div className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
          <label htmlFor="charge-picker-distance">{t('fittings.chargePicker.targetAt')}</label>
          <Slider
            id="charge-picker-distance"
            min={1}
            max={Math.max(5, maxKm)}
            step={1}
            value={Math.min(settings.distanceKm, Math.max(5, maxKm))}
            valueText={t('fittings.chargePicker.km', { km: settings.distanceKm })}
            onChange={(event) => set({ distanceKm: Number(event.target.value) })}
            className="flex-1"
          />
          <span className="w-12 text-right text-text tabular-nums">
            {t('fittings.chargePicker.km', { km: settings.distanceKm })}
          </span>
        </div>
      )}
    </div>
  );
}

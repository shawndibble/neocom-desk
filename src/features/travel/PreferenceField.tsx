/**
 * The labelled selects Travel's tabs share (issues #2328, #2330): a generic
 * `OptionField`, and the Route Preference built on it. The preference is URL
 * state only — never persisted (`features/route/routePreferences.ts`).
 */
import { useTranslation } from 'react-i18next';
import {
  FilterField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';

export function OptionField<V extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
  className = 'w-40',
}: {
  label: string;
  value: V;
  options: readonly V[];
  optionLabel: (option: V) => string;
  onChange: (next: V) => void;
  className?: string;
}) {
  return (
    <FilterField label={label} stretch={false}>
      <Select value={value} onValueChange={(next) => onChange(next as V)}>
        <SelectTrigger aria-label={label} className={className}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

export function PreferenceField({
  value,
  onChange,
}: {
  value: RoutePreferenceKind;
  onChange: (next: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <OptionField
      label={t('travel.preferenceLabel')}
      value={value}
      options={ROUTE_PREFERENCES}
      optionLabel={(preference) => t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
      onChange={onChange}
      className="w-44"
    />
  );
}

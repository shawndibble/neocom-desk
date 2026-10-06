/**
 * The labelled selects Travel's tabs share (issues #2328, #2330): a generic
 * `OptionField` (sized to its longest option), and the Route Preference built on it. The preference is URL
 * state only — never persisted (`features/route/routePreferences.ts`). Route Safety's
 * picker is not this field: it saves the default (`RouteRulesPanel.tsx`).
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
  className,
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
          {/* Sized to the longest option, not the current value, so the trigger
              never jumps when the selection changes. Each label is stamped in
              the same grid cell via a pseudo-element: it takes width but is no
              text a query or a screen reader could find. */}
          <span className="grid text-left">
            <span className="col-start-1 row-start-1 min-w-0 truncate">
              <SelectValue />
            </span>
            {options.map((option) => (
              <span
                key={option}
                aria-hidden="true"
                data-label={optionLabel(option)}
                className="invisible col-start-1 row-start-1 h-0 overflow-hidden before:content-[attr(data-label)]"
              />
            ))}
          </span>
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
    />
  );
}

/**
 * The Route Preference select Travel's tabs share (issues #2328, #2330). URL
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

export function PreferenceField({
  value,
  onChange,
}: {
  value: RoutePreferenceKind;
  onChange: (next: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  const label = t('travel.preferenceLabel');
  return (
    <FilterField label={label} stretch={false}>
      <Select value={value} onValueChange={(next) => onChange(next as RoutePreferenceKind)}>
        <SelectTrigger aria-label={label} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUTE_PREFERENCES.map((preference) => (
            <SelectItem key={preference} value={preference}>
              {t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

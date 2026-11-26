import { FACILITY_PRESETS, type FacilityKind } from '@/engine/industry/types';
import type { Translate } from '@/lib/translate';

export function buildLocationLabel(
  name: string | null,
  facility: FacilityKind,
  systemName: string,
  t: Translate
): string {
  return (
    name ??
    t('industry.buildLocationUnnamed', {
      facility: FACILITY_PRESETS[facility].name,
      system: systemName,
    })
  );
}

/**
 * How a build location is named on screen when ESI would not name it.
 *
 * Its own module beside `buildLocationPatch.ts` — that one holds what a pick
 * writes, this one holds what it reads back — because two places have to
 * produce the *same* string for the same place: the picker's result rows and
 * the plan's own search box. They take their facility and system from
 * different sources (a search hit, a stored record), and a pick swaps one for
 * the other a Dexie round-trip after the click. Any drift between them would
 * show as the box quietly rewriting itself a frame later.
 *
 * `t` is a parameter rather than a hook call, so this stays pure and testable
 * — the shape `stockLocationLabel` already uses.
 */
import { FACILITY_PRESETS, type FacilityKind } from '@/engine/industry/types';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * `name` is null wherever ESI withheld it from a Character whose role cannot
 * see the structure; the stand-in says what and where instead, which is why
 * the copy is i18next's and no record stores it.
 */
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

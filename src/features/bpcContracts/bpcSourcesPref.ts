/**
 * BPC Sourcing's Source picks, remembered across visits. A pilot who also
 * wants Contract BPOs and Market BPOs ticked them again on every visit,
 * because `sourcing.src` lived only in the URL and the Industry tab strip
 * and the rail link both open the bare path.
 *
 * A stored default rather than URL state (decision `20260922-221531`, ADR
 * 0015): `BpcSourcingPanel.tsx` hands it to `useRememberedUrlParams`, so a
 * link's `sourcing.src` still wins for that view and is never written here.
 * Only an actual Source edit, a chip's clear or Reset filters writes it.
 *
 * Device-local like its neighbour the Space filter (`bpcSpaceFilterPref.ts`),
 * not synced like the two exclude defaults in `sourcingDefaults.ts`: those
 * are Settings-page choices, this is the filter bar's own state.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import {
  DEFAULT_SOURCE_TOGGLES,
  SOURCE_TOGGLES,
  type SourceToggle,
} from '@/features/bpcContracts/bpcSourcingUrl';

export const BPC_SOURCES_SETTING_KEY = 'bpcSourcingSources';

function isSourceToggle(raw: unknown): raw is SourceToggle {
  return typeof raw === 'string' && (SOURCE_TOGGLES as readonly string[]).includes(raw);
}

export const useBpcSources = createLocalSetting<readonly SourceToggle[]>({
  key: BPC_SOURCES_SETTING_KEY,
  defaultValue: DEFAULT_SOURCE_TOGGLES,
  // An array, not a Set: Dexie stores plain structured-cloneable values. An
  // empty one is rejected, as the Space filter rejects it: a fresh visit
  // would open on "no source selected" with nothing to say why.
  parse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.every(isSourceToggle) ? (raw as SourceToggle[]) : null;
  },
});

/**
 * Which net worth layers and Characters the pilot has switched off, per device
 * (issue #2935). Stores what is HIDDEN, not what is shown, so a Character added
 * later — or a layer added to `LAYER_IDS` — shows by default, exactly as for
 * `calendarKindFilter.ts`. Device-local: never synced.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { LAYER_IDS, type LayerId } from '@/engine/netWorth/series';

const KNOWN_LAYERS = new Set<string>(LAYER_IDS);

export const useNetWorthHiddenLayers = createLocalSetting<readonly LayerId[]>({
  key: 'netWorthHiddenLayers',
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw)
      ? [...new Set(raw.filter((v): v is LayerId => typeof v === 'string' && KNOWN_LAYERS.has(v)))]
      : null,
});

export const useNetWorthHiddenCharacters = createLocalSetting<readonly number[]>({
  key: 'netWorthHiddenCharacters',
  defaultValue: [],
  // A removed Character id just never matches anything; no need to prune it.
  parse: (raw) =>
    Array.isArray(raw)
      ? [...new Set(raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
      : null,
});

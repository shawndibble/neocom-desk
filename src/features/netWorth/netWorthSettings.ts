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
  parse: (raw) =>
    Array.isArray(raw)
      ? [...new Set(raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
      : null,
});

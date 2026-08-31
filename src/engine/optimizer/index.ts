/** Skill-plan optimizer: remap placement + attribute-grouped reorder. */
export {
  aggregateSpByPair,
  bestAttributes,
  bestAttributesForPairs,
  pairKey,
  ATTRIBUTE_NAMES,
} from '@/engine/optimizer/bestAttributes';
export type { BestAttributesResult, SpByPair } from '@/engine/optimizer/bestAttributes';

export {
  MAX_SUPPORTED_REMAPS,
  placeRemaps,
  placeRemaps as optimizeRemaps,
} from '@/engine/optimizer/placeRemaps';
export { optimizeAtMarkers } from '@/engine/optimizer/optimizeAtMarkers';
export type { OptimizeAtMarkersOptions } from '@/engine/optimizer/optimizeAtMarkers';
export type {
  PlaceRemapsOptions,
  PlaceRemapsResult,
  RemapSegment,
} from '@/engine/optimizer/placeRemaps';

export { isValidOrder, suggestReorder } from '@/engine/optimizer/reorderSuggestion';

import type { BaseValue } from '@/engine/fittings/mutationEdit';
import { loadTypeDetail, type LoadTypeDetailOptions } from '@/features/skills/typeDetail';

/** A mutation's base module's own attribute values; null when its dogma won't load or is empty. */
export async function loadBaseValues(
  typeId: number,
  options?: LoadTypeDetailOptions
): Promise<BaseValue | null> {
  const attributes = (await loadTypeDetail(typeId, options))?.dogma_attributes;
  if (!attributes?.length) return null;
  const values = new Map(attributes.map((a) => [a.attribute_id, a.value] as const));
  return (attributeId) => values.get(attributeId);
}

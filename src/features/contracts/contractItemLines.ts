import type { PublicContractItem } from '@/esi/endpoints';
import { seedFromContractItem, type BuildPlanSeed } from '@/features/industry/planSeed';

export interface ContractItemLine {
  key: number;
  typeId: number;
  quantity: number;
  isIncluded: boolean;
  isBlueprintCopy: boolean;
  materialEfficiency?: number;
  timeEfficiency?: number;
  runs?: number;
  sourceCount: number;
  itemId?: number;
}

function stackKey(item: PublicContractItem): string {
  return `${item.type_id}:${item.is_included}`;
}

export function mergeContractItemLines(
  items: readonly PublicContractItem[],
  isAbyssalType: (typeId: number) => boolean = () => false
): ContractItemLine[] {
  const lines: ContractItemLine[] = [];
  const stacks = new Map<string, ContractItemLine>();

  for (const item of items) {
    const abyssal = isAbyssalType(item.type_id);
    const single = item.is_blueprint_copy || abyssal;
    const existing = single ? undefined : stacks.get(stackKey(item));
    if (existing) {
      existing.quantity += item.quantity;
      existing.sourceCount += 1;
      continue;
    }
    const line: ContractItemLine = {
      key: item.record_id,
      typeId: item.type_id,
      quantity: item.quantity,
      isIncluded: item.is_included,
      isBlueprintCopy: item.is_blueprint_copy === true,
      materialEfficiency: item.material_efficiency,
      timeEfficiency: item.time_efficiency,
      runs: item.runs,
      sourceCount: 1,
      ...(abyssal && item.item_id !== undefined ? { itemId: item.item_id } : {}),
    };
    lines.push(line);
    if (!single) stacks.set(stackKey(item), line);
  }

  return lines;
}

export function planSeedForLine(line: ContractItemLine): BuildPlanSeed | null {
  return seedFromContractItem({
    is_blueprint_copy: line.isBlueprintCopy,
    material_efficiency: line.materialEfficiency,
    time_efficiency: line.timeEfficiency,
    runs: line.runs,
  });
}

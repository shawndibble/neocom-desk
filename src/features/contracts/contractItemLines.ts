/**
 * Collapses a public contract's ESI item lines into the lines a reader should
 * see (issue: contract items modal).
 *
 * ESI reports one record per *stack* in the issuer's hangar, not per item
 * type, so a contract holding five Large Skill Injectors routinely comes back
 * as three lines — ×1, ×2, ×2 — which reads as three different things offered
 * rather than one pile of five. Nothing on the contract distinguishes those
 * stacks once accepted, so they are one line here.
 *
 * Blueprint copies are the exception and never merge: `material_efficiency`,
 * `time_efficiency` and `runs` describe the one copy, and the Build Plan seed
 * the modal's context menu hands off is per copy too. Two BPCs of the same
 * type are genuinely two different offers. A blueprint *original* carries none
 * of those fields, so it stacks with other originals like any other item — and
 * separately from the copies it shares a type ID with.
 */
import type { PublicContractItem } from '@/esi/endpoints';
import { seedFromContractItem, type BuildPlanSeed } from '@/features/industry/planSeed';

export interface ContractItemLine {
  /** The `record_id` of the first ESI line folded in — a stable React key. */
  key: number;
  typeId: number;
  /** Summed across every ESI line folded in. */
  quantity: number;
  /** False means the issuer *wants* this item rather than offering it. */
  isIncluded: boolean;
  isBlueprintCopy: boolean;
  materialEfficiency?: number;
  timeEfficiency?: number;
  runs?: number;
  /** How many ESI lines this one stands for. 1 when nothing merged. */
  sourceCount: number;
}

function stackKey(item: PublicContractItem): string {
  return `${item.type_id}:${item.is_included}`;
}

export function mergeContractItemLines(items: readonly PublicContractItem[]): ContractItemLine[] {
  const lines: ContractItemLine[] = [];
  const stacks = new Map<string, ContractItemLine>();

  for (const item of items) {
    const existing = item.is_blueprint_copy ? undefined : stacks.get(stackKey(item));
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
    };
    lines.push(line);
    if (!line.isBlueprintCopy) stacks.set(stackKey(item), line);
  }

  return lines;
}

/**
 * The Build Plan seed for one line, in `seedFromContractItem`'s ESI spelling.
 * Lives here rather than in the modal so the camelCase/snake_case bridge is
 * written once, next to the type that renamed the fields.
 */
export function planSeedForLine(line: ContractItemLine): BuildPlanSeed | null {
  return seedFromContractItem({
    is_blueprint_copy: line.isBlueprintCopy,
    material_efficiency: line.materialEfficiency,
    time_efficiency: line.timeEfficiency,
    runs: line.runs,
  });
}

import type { FittingSlotKind } from './types';

export type CandidateRack = FittingSlotKind | 'drone';

export interface CandidateEntry {
  typeId: number;
  name: string;
  marketGroupId: number;
}

export const CANDIDATE_LIMIT = 100;

export interface BrowserGroupNode {
  id: number;
  name: string;
  parentId: number | null;
  hasTypes: boolean;
}

export interface BrowserNode<T extends CandidateEntry> {
  id: number;
  label: string;
  count: number;
  children: BrowserNode<T>[];
  items: T[];
}

export function browserTree<T extends CandidateEntry>(
  entries: readonly T[],
  include: (entry: T) => boolean,
  groupsById: ReadonlyMap<number, BrowserGroupNode>
): BrowserNode<T>[] {
  const nodes = new Map<number, BrowserNode<T>>();
  const roots: BrowserNode<T>[] = [];
  const nodeFor = (id: number): BrowserNode<T> | null => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const group = groupsById.get(id);
    if (!group) return null;
    const node: BrowserNode<T> = { id, label: group.name, count: 0, children: [], items: [] };
    nodes.set(id, node);
    const parent = group.parentId === null ? null : nodeFor(group.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
    return node;
  };

  for (const entry of entries) {
    if (!groupsById.has(entry.marketGroupId) || !include(entry)) continue;
    nodeFor(entry.marketGroupId)!.items.push(entry);
    let id: number | null = entry.marketGroupId;
    while (id !== null) {
      nodes.get(id)!.count += 1;
      id = groupsById.get(id)?.parentId ?? null;
    }
  }

  const finish = (node: BrowserNode<T>): BrowserNode<T> => {
    let current = node;
    while (current.items.length === 0 && current.children.length === 1) {
      const child = current.children[0];
      current = { ...child, label: `${current.label} · ${child.label}` };
    }
    return {
      ...current,
      items: [...current.items].sort((a, b) => a.name.localeCompare(b.name)),
      children: current.children.map(finish).sort((a, b) => a.label.localeCompare(b.label)),
    };
  };
  return roots.map(finish).sort((a, b) => a.label.localeCompare(b.label));
}

const HULL_RULES: ReadonlySet<string> = new Set([
  'wrong_slot',
  'wrong_slot_index',
  'slots',
  'subsystem_taken',
  'rig_size',
  'ship_restricted',
  'capital_item',
  'structure_item',
  'ship_item',
  'max_group',
  'max_type',
  'not_a_module',
  'not_a_drone',
]);

const FITTING_RESOURCE_RULES: ReadonlySet<string> = new Set([
  'resource:cpu',
  'resource:powergrid',
  'resource:calibration',
]);

export function classifyRuleBreaks(ruleTypes: readonly string[]): {
  fitsHull: boolean;
  canFly: boolean;
  fitsResources: boolean;
} {
  return {
    fitsHull: !ruleTypes.some((rule) => HULL_RULES.has(rule)),
    canFly: !ruleTypes.includes('skill'),
    fitsResources: !ruleTypes.some((rule) => FITTING_RESOURCE_RULES.has(rule)),
  };
}

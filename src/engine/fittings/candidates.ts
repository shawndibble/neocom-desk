/**
 * The Fitting editor's module browser narrows the market catalogue to what
 * fits the open hull (`useHullFit`, from the engine's own fit check) and
 * groups it by market group (`browserTree`); `classifyRuleBreaks` turns
 * what that check reports into "fits this hull" and "can fly".
 */

import type { FittingSlotKind } from './types';

/** A rack plus the drone bay — the same values as `FittingSlotAssignment` in `src/sde/types.ts`. */
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
  /** The group's name — or a run of names ("Hull & Armor · Armor Plates") where single-child groups were merged. */
  label: string;
  /** Items passing `include` anywhere under this node. */
  count: number;
  children: BrowserNode<T>[];
  /** Items directly in this group. */
  items: T[];
}

/**
 * The module browser's tree (mockup A, the game's own fitting browser): the
 * market-group hierarchy cut down to the groups holding an item that passes
 * `include` — fits the hull, the chosen slot, the filters. A group left with
 * a single child and no items of its own merges into that child, so no
 * level is a lone click-through. Items whose group isn't known drop.
 */
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

/**
 * Rules (the engine's `Rule.type`) under which an item cannot go on this hull
 * at all, whatever else is fitted: wrong rack, no hardpoint, wrong rig size,
 * a hull-restricted or capital/structure item, a one-per-ship limit.
 * Resource overflow is not a hull rule (the game lets you fit an item that
 * overflows CPU or powergrid — it just can't online): it is its own answer,
 * `fitsResources`, since an item that overflows the bare hull alone can never
 * be used on it.
 */
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
]);

/** The resources a lone module can overflow the bare hull on, as `resource:<kind>`. */
const FITTING_RESOURCE_RULES: ReadonlySet<string> = new Set([
  'resource:cpu',
  'resource:powergrid',
  'resource:calibration',
]);

/**
 * `ruleTypes` are the engine's `Rule.type`s, a resource rule spelled
 * `resource:<kind>` (`resource:powergrid`) so the kinds can be told apart.
 */
export function classifyRuleBreaks(ruleTypes: readonly string[]): {
  fitsHull: boolean;
  canFly: boolean;
  /** Fits the bare hull's CPU, powergrid and calibration, with the pilot's skills. */
  fitsResources: boolean;
} {
  return {
    fitsHull: !ruleTypes.some((rule) => HULL_RULES.has(rule)),
    canFly: !ruleTypes.includes('skill'),
    fitsResources: !ruleTypes.some((rule) => FITTING_RESOURCE_RULES.has(rule)),
  };
}

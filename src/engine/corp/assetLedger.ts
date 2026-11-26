import { assetStackValue } from '../assetTree';
import { HANGAR_DIVISIONS, type CorpAssetInput, type HangarDivisionNumber } from './assetDivisions';

export type LedgerState =
  | 'offices'
  | 'deliveries'
  | 'inSpace'
  | 'fuelBay'
  | 'impounded'
  | 'assetSafety'
  | 'lockdown'
  | 'capsuleerDeliveries'
  | 'other';

export const LEDGER_STATES: readonly LedgerState[] = [
  'offices',
  'deliveries',
  'inSpace',
  'fuelBay',
  'impounded',
  'assetSafety',
  'lockdown',
  'capsuleerDeliveries',
  'other',
];

export type LedgerTab = LedgerState | 'all';

export interface LedgerPathEntry {
  itemId: number;
  typeId: number;
}

export interface ClassifiedAsset {
  input: CorpAssetInput;
  state: LedgerState;
  locationId: number | null;
  division: HangarDivisionNumber | null;
  path: LedgerPathEntry[];
}

export interface ClassifiedCorpAssets {
  items: ClassifiedAsset[];
  officeLocationIds: ReadonlySet<number>;
}

const HANGAR_FLAG = /^CorpSAG([1-7])$/;
const IN_SPACE_FLAG = /^(ServiceSlot\d+|QuantumCoreRoom|StructureDeedBay|MoonMaterialBay)$/;

const STATE_BY_FLAG: Readonly<Record<string, LedgerState>> = {
  CorpDeliveries: 'deliveries',
  StructureFuel: 'fuelBay',
  Impounded: 'impounded',
  AssetSafety: 'assetSafety',
  Locked: 'lockdown',
  Deliveries: 'capsuleerDeliveries',
};

function rootState(root: CorpAssetInput): {
  state: LedgerState;
  division: HangarDivisionNumber | null;
} {
  const hangar = HANGAR_FLAG.exec(root.locationFlag);
  if (hangar) return { state: 'offices', division: Number(hangar[1]) as HangarDivisionNumber };
  const named = STATE_BY_FLAG[root.locationFlag];
  if (named) return { state: named, division: null };
  if (root.locationType === 'solar_system' || IN_SPACE_FLAG.test(root.locationFlag)) {
    return { state: 'inSpace', division: null };
  }
  return { state: 'other', division: null };
}

export function classifyCorpAssets(inputs: readonly CorpAssetInput[]): ClassifiedCorpAssets {
  const byItemId = new Map<number, CorpAssetInput>();
  const officeLocationIds = new Set<number>();
  for (const input of inputs) {
    byItemId.set(input.itemId, input);
    if (input.locationFlag === 'OfficeFolder') officeLocationIds.add(input.locationId);
  }

  const items: ClassifiedAsset[] = [];
  for (const input of inputs) {
    if (input.locationFlag === 'OfficeFolder') continue;

    const seen = new Set<number>([input.itemId]);
    const ancestors: CorpAssetInput[] = [];
    let root = input;
    let cyclic = false;
    for (;;) {
      const parent = byItemId.get(root.locationId);
      if (!parent || parent.locationFlag === 'OfficeFolder') break;
      if (seen.has(parent.itemId)) {
        cyclic = true;
        break;
      }
      seen.add(parent.itemId);
      ancestors.unshift(parent);
      root = parent;
    }

    const officeParent = byItemId.get(root.locationId);
    const officeLocation =
      officeParent?.locationFlag === 'OfficeFolder' ? officeParent.locationId : null;
    const { state, division } = cyclic
      ? { state: 'other' as const, division: null }
      : rootState(root);
    items.push({
      input,
      state,
      division,
      locationId: cyclic ? null : (officeLocation ?? root.locationId),
      path: ancestors.map((a) => ({ itemId: a.itemId, typeId: a.typeId })),
    });
  }
  return { items, officeLocationIds };
}

export function countLedgerByState(items: readonly ClassifiedAsset[]): Record<LedgerTab, number> {
  const counts = { all: 0 } as Record<LedgerTab, number>;
  for (const state of LEDGER_STATES) counts[state] = 0;
  for (const item of items) {
    counts[item.state] += 1;
    counts.all += 1;
  }
  return counts;
}

export interface LedgerValuation {
  prices: ReadonlyMap<number, number>;
  copyValues?: ReadonlyMap<number, number>;
  volumes?: ReadonlyMap<number, number>;
}

function stackValue(item: ClassifiedAsset, v: LedgerValuation): number {
  const { input } = item;
  return assetStackValue(
    {
      item_id: input.itemId,
      type_id: input.typeId,
      quantity: input.quantity,
      is_blueprint_copy: input.isBlueprintCopy,
    },
    v.prices,
    v.copyValues
  );
}

function stackVolume(item: ClassifiedAsset, v: LedgerValuation): number | null {
  if (!v.volumes) return null;
  return item.input.quantity * (v.volumes.get(item.input.typeId) ?? 0);
}

export interface LedgerStack {
  itemId: number;
  typeId: number;
  isBlueprintCopy: boolean;
  quantity: number;
  estimatedValue: number;
  volume: number | null;
  isSingleton: boolean | null;
  state: LedgerState;
  locationId: number | null;
  division: HangarDivisionNumber | null;
  path: LedgerPathEntry[];
}

function toStack(item: ClassifiedAsset, v: LedgerValuation): LedgerStack {
  return {
    itemId: item.input.itemId,
    typeId: item.input.typeId,
    isBlueprintCopy: item.input.isBlueprintCopy === true,
    quantity: item.input.quantity,
    estimatedValue: stackValue(item, v),
    volume: stackVolume(item, v),
    isSingleton: item.input.isSingleton ?? null,
    state: item.state,
    locationId: item.locationId,
    division: item.division,
    path: item.path,
  };
}

export interface LedgerPlacement {
  state: LedgerState;
  locationId: number | null;
  division: HangarDivisionNumber | null;
  quantity: number;
  estimatedValue: number;
}

export type StockStatus = 'met' | 'short' | 'none-owned';

export interface StockTargetStatus {
  target: number;
  owned: number;
  shortBy: number;
  status: StockStatus;
}

export function evaluateStockTargets(
  targets: ReadonlyMap<number, number>,
  items: readonly ClassifiedAsset[]
): Map<number, StockTargetStatus> {
  const owned = new Map<number, number>();
  for (const item of items) {
    if (item.input.isBlueprintCopy) continue;
    if (item.state !== 'offices' && item.state !== 'deliveries') continue;
    if (!targets.has(item.input.typeId)) continue;
    owned.set(item.input.typeId, (owned.get(item.input.typeId) ?? 0) + item.input.quantity);
  }
  const result = new Map<number, StockTargetStatus>();
  for (const [typeId, target] of targets) {
    const have = owned.get(typeId) ?? 0;
    const shortBy = Math.max(0, target - have);
    result.set(typeId, {
      target,
      owned: have,
      shortBy,
      status: shortBy === 0 ? 'met' : have === 0 ? 'none-owned' : 'short',
    });
  }
  return result;
}

export interface LedgerFilter {
  state?: LedgerTab;
  locationId?: number;
  division?: HangarDivisionNumber;
}

function matches(item: ClassifiedAsset, filter: LedgerFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.state && filter.state !== 'all' && item.state !== filter.state) return false;
  if (filter.locationId !== undefined && item.locationId !== filter.locationId) return false;
  if (filter.division !== undefined && item.division !== filter.division) return false;
  return true;
}

export interface ItemLedgerRow {
  typeId: number;
  isBlueprintCopy: boolean;
  quantity: number;
  estimatedValue: number;
  volume: number | null;
  placements: LedgerPlacement[];
  stacks: LedgerStack[];
  stock: StockTargetStatus | null;
}

export interface ItemLedgerOptions extends LedgerValuation {
  filter?: LedgerFilter;
  targets?: ReadonlyMap<number, number>;
  stock?: ReadonlyMap<number, StockTargetStatus>;
}

function placementKey(s: LedgerStack): string {
  return `${s.state}|${s.locationId ?? ''}|${s.division ?? ''}`;
}

export function buildItemLedger(
  items: readonly ClassifiedAsset[],
  options: ItemLedgerOptions
): ItemLedgerRow[] {
  const { filter, targets } = options;
  const stock =
    options.stock ??
    (targets ? evaluateStockTargets(targets, items) : new Map<number, StockTargetStatus>());

  const rows = new Map<string, ItemLedgerRow>();
  const placements = new Map<string, Map<string, LedgerPlacement>>();
  for (const item of items) {
    if (!matches(item, filter)) continue;
    const stack = toStack(item, options);
    const key = `${stack.typeId}:${stack.isBlueprintCopy ? 'c' : 'o'}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        typeId: stack.typeId,
        isBlueprintCopy: stack.isBlueprintCopy,
        quantity: 0,
        estimatedValue: 0,
        volume: options.volumes ? 0 : null,
        placements: [],
        stacks: [],
        stock: stack.isBlueprintCopy ? null : (stock.get(stack.typeId) ?? null),
      };
      rows.set(key, row);
      placements.set(key, new Map());
    }
    row.quantity += stack.quantity;
    row.estimatedValue += stack.estimatedValue;
    if (row.volume !== null) row.volume += stack.volume ?? 0;
    row.stacks.push(stack);

    const byKey = placements.get(key)!;
    const pk = placementKey(stack);
    const placement = byKey.get(pk);
    if (placement) {
      placement.quantity += stack.quantity;
      placement.estimatedValue += stack.estimatedValue;
    } else {
      byKey.set(pk, {
        state: stack.state,
        locationId: stack.locationId,
        division: stack.division,
        quantity: stack.quantity,
        estimatedValue: stack.estimatedValue,
      });
    }
  }
  for (const [key, row] of rows) row.placements = [...placements.get(key)!.values()];

  const targetRowsApply =
    (!filter?.state || filter.state === 'all' || filter.state === 'offices') &&
    filter?.locationId === undefined &&
    filter?.division === undefined;
  if (targets && targetRowsApply) {
    for (const [typeId, status] of stock) {
      if (rows.has(`${typeId}:o`)) continue;
      rows.set(`${typeId}:o`, {
        typeId,
        isBlueprintCopy: false,
        quantity: 0,
        estimatedValue: 0,
        volume: options.volumes ? 0 : null,
        placements: [],
        stacks: [],
        stock: status,
      });
    }
  }
  return [...rows.values()];
}

export interface LedgerCell {
  itemCount: number;
  estimatedValue: number;
  volume: number | null;
  topStacks: LedgerStack[];
  stacks: LedgerStack[];
}

export interface OfficeDivisionCell extends LedgerCell {
  division: HangarDivisionNumber;
}

export interface OfficeGroup {
  locationId: number;
  divisions: OfficeDivisionCell[];
  deliveries: LedgerCell;
  isEmpty: boolean;
}

export interface PlaceGroup extends LedgerCell {
  state: LedgerState;
  locationId: number | null;
}

export interface LocationLedger {
  offices: OfficeGroup[];
  others: PlaceGroup[];
}

function buildCell(stacks: readonly LedgerStack[], hasVolumes: boolean): LedgerCell {
  let itemCount = 0;
  let estimatedValue = 0;
  let volume = hasVolumes ? 0 : null;
  for (const s of stacks) {
    itemCount += 1;
    estimatedValue += s.estimatedValue;
    if (volume !== null) volume += s.volume ?? 0;
  }
  const topStacks = [...stacks]
    .sort(
      (a, b) =>
        b.estimatedValue - a.estimatedValue || b.quantity - a.quantity || a.itemId - b.itemId
    )
    .slice(0, 3);
  return { itemCount, estimatedValue, volume, topStacks, stacks: [...stacks] };
}

export function buildLocationLedger(
  classified: ClassifiedCorpAssets,
  valuation: LedgerValuation
): LocationLedger {
  const hasVolumes = valuation.volumes !== undefined;
  const officeStacks = new Map<number, LedgerStack[]>();
  for (const id of classified.officeLocationIds) officeStacks.set(id, []);
  const otherStacks = new Map<
    string,
    { state: PlaceGroup['state']; locationId: number | null; stacks: LedgerStack[] }
  >();

  for (const item of classified.items) {
    const stack = toStack(item, valuation);
    const inOffice =
      (item.state === 'offices' || item.state === 'deliveries') &&
      item.locationId !== null &&
      officeStacks.has(item.locationId);
    if (inOffice && item.locationId !== null) {
      const list = officeStacks.get(item.locationId) ?? [];
      list.push(stack);
      officeStacks.set(item.locationId, list);
    } else {
      const state = item.state;
      const key = `${state}|${item.locationId ?? ''}`;
      const group = otherStacks.get(key) ?? { state, locationId: item.locationId, stacks: [] };
      group.stacks.push(stack);
      otherStacks.set(key, group);
    }
  }

  const offices: OfficeGroup[] = [...officeStacks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([locationId, stacks]) => {
      const divisions = HANGAR_DIVISIONS.map((division) => ({
        division,
        ...buildCell(
          stacks.filter((s) => s.state === 'offices' && s.division === division),
          hasVolumes
        ),
      }));
      return {
        locationId,
        divisions,
        deliveries: buildCell(
          stacks.filter((s) => s.state === 'deliveries'),
          hasVolumes
        ),
        isEmpty: divisions.every((d) => d.itemCount === 0),
      };
    });

  const others: PlaceGroup[] = [...otherStacks.values()]
    .sort(
      (a, b) =>
        LEDGER_STATES.indexOf(a.state) - LEDGER_STATES.indexOf(b.state) ||
        (a.locationId ?? 0) - (b.locationId ?? 0)
    )
    .map((g) => ({ state: g.state, locationId: g.locationId, ...buildCell(g.stacks, hasVolumes) }));

  return { offices, others };
}

export interface LedgerContentsNode {
  itemId: number;
  typeId: number;
  stack: LedgerStack | null;
  children: LedgerContentsNode[];
  itemCount: number;
  estimatedValue: number;
}

export function buildContentsTree(stacks: readonly LedgerStack[]): LedgerContentsNode[] {
  const nodes = new Map<number, LedgerContentsNode>();
  const roots: LedgerContentsNode[] = [];
  const nodeFor = (itemId: number, typeId: number, parent: LedgerContentsNode | null) => {
    let node = nodes.get(itemId);
    if (!node) {
      node = { itemId, typeId, stack: null, children: [], itemCount: 0, estimatedValue: 0 };
      nodes.set(itemId, node);
      (parent?.children ?? roots).push(node);
    }
    return node;
  };
  for (const stack of stacks) {
    let parent: LedgerContentsNode | null = null;
    for (const entry of stack.path) parent = nodeFor(entry.itemId, entry.typeId, parent);
    nodeFor(stack.itemId, stack.typeId, parent).stack = stack;
  }
  const settle = (list: LedgerContentsNode[]): void => {
    for (const node of list) {
      settle(node.children);
      node.estimatedValue = node.stack?.estimatedValue ?? 0;
      node.itemCount = 0;
      for (const child of node.children) {
        node.estimatedValue += child.estimatedValue;
        node.itemCount += 1 + child.itemCount;
      }
    }
    list.sort(
      (a, b) =>
        Number(b.children.length > 0) - Number(a.children.length > 0) ||
        b.estimatedValue - a.estimatedValue ||
        a.itemId - b.itemId
    );
  };
  settle(roots);
  return roots;
}

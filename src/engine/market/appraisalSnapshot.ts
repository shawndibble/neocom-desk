import { isFiniteNumber } from '../guards';
import { refineFromDetail, type AppraisalItem } from './appraisal';

export const APPRAISAL_SNAPSHOT_VERSION = 1;

export const MAX_SNAPSHOT_ITEMS = 1000;

const MAX_REFINE_MATERIALS = 16;
const MAX_REFINE_MINERALS = 200;

export interface AppraisalSnapshotRefineItem {
  portionSize: number;
  materials: { typeId: number; quantity: number }[];
  efficiency: number;
}

export interface AppraisalSnapshotRefine {
  yieldRate: number;
  taxRate: number;
  minerals: { typeId: number; name: string; price: number | null; sellPrice?: number | null }[];
}

export interface AppraisalSnapshotItem {
  typeId: number;
  name: string;
  quantity: number;
  buy: number | null;
  sell: number | null;
  unitVolume: number | null;
  refine?: AppraisalSnapshotRefineItem;
}

export interface AppraisalSnapshot {
  v: typeof APPRAISAL_SNAPSHOT_VERSION;
  hub: string;
  pricePercent: number;
  generatedAt: number;
  items: AppraisalSnapshotItem[];
  refine?: AppraisalSnapshotRefine;
}

export type BuildAppraisalSnapshotResult =
  { ok: true; value: AppraisalSnapshot } | { ok: false; reason: 'empty' | 'too-large' };

export function buildAppraisalSnapshot(input: {
  hub: string;
  pricePercent: number;
  generatedAt: number;
  items: readonly AppraisalItem[];
  refining?: { yieldRate: number; taxRate: number };
  mineralNames?: ReadonlyMap<number, string>;
}): BuildAppraisalSnapshotResult {
  if (input.items.length === 0) return { ok: false, reason: 'empty' };
  if (input.items.length > MAX_SNAPSHOT_ITEMS) return { ok: false, reason: 'too-large' };
  const mineralPrices = new Map<number, number | null>();
  const mineralSellPrices = new Map<number, number | null>();
  const items = input.items.map((item): AppraisalSnapshotItem => {
    const base: AppraisalSnapshotItem = {
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      buy: item.buy,
      sell: item.sell,
      unitVolume: item.unitVolume ?? null,
    };
    const detail = item.refine?.detail;
    if (!detail) return base;
    for (const material of detail.materials) {
      const price = detail.materialPrices[material.typeId] ?? null;
      if (!mineralPrices.has(material.typeId) || mineralPrices.get(material.typeId) === null) {
        mineralPrices.set(material.typeId, price);
      }
      if (detail.materialSellPrices) {
        const sellPrice = detail.materialSellPrices[material.typeId] ?? null;
        if (
          !mineralSellPrices.has(material.typeId) ||
          mineralSellPrices.get(material.typeId) === null
        ) {
          mineralSellPrices.set(material.typeId, sellPrice);
        }
      }
    }
    return {
      ...base,
      refine: {
        portionSize: detail.portionSize,
        materials: detail.materials.map((m) => ({ typeId: m.typeId, quantity: m.quantity })),
        efficiency: detail.efficiency,
      },
    };
  });
  const value: AppraisalSnapshot = {
    v: APPRAISAL_SNAPSHOT_VERSION,
    hub: input.hub,
    pricePercent: input.pricePercent,
    generatedAt: input.generatedAt,
    items,
  };
  if (input.refining && mineralPrices.size > 0) {
    value.refine = {
      yieldRate: input.refining.yieldRate,
      taxRate: input.refining.taxRate,
      minerals: [...mineralPrices].map(([typeId, price]) => ({
        typeId,
        name: input.mineralNames?.get(typeId) ?? '',
        price,
        ...(mineralSellPrices.has(typeId)
          ? { sellPrice: mineralSellPrices.get(typeId) ?? null }
          : {}),
      })),
    };
  }
  return { ok: true, value };
}

function isPrice(value: unknown): value is number | null {
  return value === null || (isFiniteNumber(value) && value >= 0);
}

function parseRefineItem(raw: unknown): AppraisalSnapshotRefineItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const refine = raw as Record<string, unknown>;
  if (!Number.isInteger(refine.portionSize) || (refine.portionSize as number) <= 0) return null;
  if (!isFiniteNumber(refine.efficiency) || refine.efficiency < 0) return null;
  if (!Array.isArray(refine.materials) || refine.materials.length > MAX_REFINE_MATERIALS) {
    return null;
  }
  const materials: AppraisalSnapshotRefineItem['materials'] = [];
  for (const material of refine.materials as unknown[]) {
    if (typeof material !== 'object' || material === null) return null;
    const { typeId, quantity } = material as Record<string, unknown>;
    if (!Number.isInteger(typeId) || (typeId as number) <= 0) return null;
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) return null;
    materials.push({ typeId: typeId as number, quantity: quantity as number });
  }
  return { portionSize: refine.portionSize as number, materials, efficiency: refine.efficiency };
}

function parseRefine(raw: unknown): AppraisalSnapshotRefine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const refine = raw as Record<string, unknown>;
  if (!isFiniteNumber(refine.yieldRate) || refine.yieldRate < 0) return null;
  if (!isFiniteNumber(refine.taxRate) || refine.taxRate < 0 || refine.taxRate > 1) return null;
  if (!Array.isArray(refine.minerals) || refine.minerals.length > MAX_REFINE_MINERALS) return null;
  const minerals: AppraisalSnapshotRefine['minerals'] = [];
  for (const mineral of refine.minerals as unknown[]) {
    if (typeof mineral !== 'object' || mineral === null) return null;
    const { typeId, name, price } = mineral as Record<string, unknown>;
    if (!Number.isInteger(typeId) || (typeId as number) <= 0) return null;
    if (typeof name !== 'string' || !isPrice(price)) return null;
    const { sellPrice } = mineral as Record<string, unknown>;
    minerals.push({
      typeId: typeId as number,
      name,
      price,
      ...(sellPrice !== undefined && isPrice(sellPrice) ? { sellPrice } : {}),
    });
  }
  return { yieldRate: refine.yieldRate, taxRate: refine.taxRate, minerals };
}

function parseItem(raw: unknown): AppraisalSnapshotItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!Number.isInteger(item.typeId) || (item.typeId as number) <= 0) return null;
  if (typeof item.name !== 'string') return null;
  if (!Number.isInteger(item.quantity) || (item.quantity as number) <= 0) return null;
  if (!isPrice(item.buy) || !isPrice(item.sell) || !isPrice(item.unitVolume)) return null;
  const parsed: AppraisalSnapshotItem = {
    typeId: item.typeId as number,
    name: item.name,
    quantity: item.quantity as number,
    buy: item.buy,
    sell: item.sell,
    unitVolume: item.unitVolume,
  };
  const refine = item.refine === undefined ? null : parseRefineItem(item.refine);
  if (refine) parsed.refine = refine;
  return parsed;
}

export function parseAppraisalSnapshot(raw: unknown): AppraisalSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.v !== APPRAISAL_SNAPSHOT_VERSION) return null;
  if (typeof data.hub !== 'string') return null;
  if (!isFiniteNumber(data.pricePercent) || !isFiniteNumber(data.generatedAt)) return null;
  if (!Array.isArray(data.items) || data.items.length > MAX_SNAPSHOT_ITEMS) return null;
  const items: AppraisalSnapshotItem[] = [];
  for (const raw of data.items) {
    const item = parseItem(raw);
    if (item === null) return null;
    items.push(item);
  }
  const snapshot: AppraisalSnapshot = {
    v: APPRAISAL_SNAPSHOT_VERSION,
    hub: data.hub,
    pricePercent: data.pricePercent,
    generatedAt: data.generatedAt,
    items,
  };
  const refine = data.refine === undefined ? null : parseRefine(data.refine);
  if (refine) snapshot.refine = refine;
  else for (const item of snapshot.items) delete item.refine;
  return snapshot;
}

export function appraisalItemsFromSnapshot(snapshot: AppraisalSnapshot): AppraisalItem[] {
  const refine = snapshot.refine;
  const priceOf = new Map<number, number>();
  const sellPriceOf = new Map<number, number>();
  const hasSellSide = (refine?.minerals ?? []).some((mineral) => mineral.sellPrice !== undefined);
  for (const mineral of refine?.minerals ?? []) {
    if (mineral.price !== null) priceOf.set(mineral.typeId, mineral.price);
    if (mineral.sellPrice != null) sellPriceOf.set(mineral.typeId, mineral.sellPrice);
  }
  return snapshot.items.map((item) => {
    const { refine: stored, ...rest } = item;
    if (!refine || !stored) return rest;
    const materialPrices: Record<number, number> = {};
    const materialSellPrices: Record<number, number> = {};
    for (const material of stored.materials) {
      const price = priceOf.get(material.typeId);
      if (price !== undefined) materialPrices[material.typeId] = price;
      const sellPrice = sellPriceOf.get(material.typeId);
      if (sellPrice !== undefined) materialSellPrices[material.typeId] = sellPrice;
    }
    return {
      ...rest,
      refine: refineFromDetail(
        item.quantity,
        {
          portionSize: stored.portionSize,
          materials: stored.materials,
          efficiency: stored.efficiency,
          materialPrices,
          ...(hasSellSide ? { materialSellPrices } : {}),
        },
        refine.taxRate
      ),
    };
  });
}

export function appraisalSnapshotPasteText(snapshot: AppraisalSnapshot): string {
  return snapshot.items.map((item) => `${item.name}\t${item.quantity}`).join('\n');
}

export function appraisalSnapshotReuseKey(snapshot: AppraisalSnapshot): string {
  return JSON.stringify([
    snapshot.hub,
    snapshot.pricePercent,
    snapshot.items,
    snapshot.refine ?? null,
  ]);
}

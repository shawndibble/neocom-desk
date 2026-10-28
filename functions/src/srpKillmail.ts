// SRP file-claim (ADR 0026): the pure half. Parsing a pasted killmail link, the
// claim window, the items an Appraisal prices, and mapping the corp's Hull Rules onto the
// pricing engine. No Firestore, no fetch. The network seam is SrpKillmailSource; the
// implementation is srpKillmailEsi.ts, the transaction is srpStore.ts.

import { HttpsError } from 'firebase-functions/v2/https';
import { boundedString, record } from './communities.js';
import { int } from './corpTaxBook.js';
import type { SrpHullRule, SrpPricingInput } from './srpPricing.js';
import type { DoctrineFitSnapshot } from './srpDoctrine.js';
import type { HullRule, SrpSettings } from './srpTypes.js';

export const MAX_NOTE_LENGTH = 500;
const FUTURE_SLACK_MS = 60 * 60_000;
const DAY_MS = 86_400_000;

export interface KillmailRef {
  killmailId: number;
  /** Only an ESI link carries it; a zKillboard link needs zKillboard's API to find it. */
  hash?: string;
}

const ZKILL_LINK = /^https:\/\/(?:www\.)?zkillboard\.com\/kill\/(\d+)\/?(?:[?#].*)?$/i;
const ESI_LINK =
  /^https:\/\/esi\.evetech\.net\/(?:latest\/|dev\/|v\d+\/)?killmails\/(\d+)\/([0-9a-f]{40})\/?(?:[?#].*)?$/i;

/** A pasted zKillboard or ESI killmail link. The client never supplies hull, system or time. */
export function parseKillmailRef(value: unknown): KillmailRef {
  const text = typeof value === 'string' ? value.trim() : '';
  const zkill = ZKILL_LINK.exec(text);
  const esi = zkill ? null : ESI_LINK.exec(text);
  const match = zkill ?? esi;
  if (!match) {
    throw new HttpsError('invalid-argument', 'Paste a zKillboard or ESI killmail link', {
      reason: 'bad-killmail-link',
    });
  }
  const killmailId = int(Number(match[1]), 'killmailId', 1, 2_147_483_647);
  return esi ? { killmailId, hash: match[2].toLowerCase() } : { killmailId };
}

export interface FileClaimInput {
  ref: KillmailRef;
  fleetOrFc: string | null;
  note: string | null;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be text`);
  }
  return value.trim() === '' ? null : boundedString(value, field, MAX_NOTE_LENGTH);
}

export function parseFileClaimInput(data: unknown): FileClaimInput {
  const d = record(data);
  return {
    ref: parseKillmailRef(d.killmail),
    fleetOrFc: optionalText(d.fleetOrFc, 'fleetOrFc'),
    note: optionalText(d.note, 'note'),
  };
}

/** The loss is no older than the corp's window; a clock-skew sliver of future is tolerated. */
export function withinWindow(killedAt: number, now: number, windowDays: number): boolean {
  return killedAt <= now + FUTURE_SLACK_MS && now - killedAt <= windowDays * DAY_MS;
}

// --- Killmail source -------------------------------------------------------

export interface KillmailItem {
  item_type_id?: number;
  /** ESI inventory flag: which slot (or cargo) the item sat in. Top-level victim items only. */
  flag?: number;
  quantity_dropped?: number;
  quantity_destroyed?: number;
  items?: KillmailItem[];
}

export interface EsiKillmail {
  killmailId: number;
  killedAt: number;
  solarSystemId: number;
  victim: {
    characterId: number | null;
    corporationId: number | null;
    shipTypeId: number;
    items: KillmailItem[];
  };
}

/** What zKillboard knows about a killmail. Both null when it is down or has no entry. */
export interface ZkillRecord {
  hash: string | null;
  totalValue: number | null;
}

/**
 * Every outside read the file-claim callable needs. `zkill` and `jitaValue` fail soft (null);
 * `killmail` and `shipGroupId` throw an HttpsError.
 */
export interface SrpKillmailSource {
  zkill(killmailId: number): Promise<ZkillRecord>;
  killmail(killmailId: number, hash: string): Promise<EsiKillmail>;
  /** The hull's ship group id from ESI `/universe/types/{id}`: the key class Hull Rules use. */
  shipGroupId(typeId: number): Promise<number>;
  /** Jita 4-4 value of a type -> quantity map; null when no price is known. */
  jitaValue(items: ReadonlyMap<number, number>): Promise<number | null>;
}

function addItems(into: Map<number, number>, items: readonly KillmailItem[]): void {
  for (const item of items) {
    const typeId = item.item_type_id;
    if (typeof typeId === 'number') {
      const quantity = (item.quantity_dropped ?? 0) + (item.quantity_destroyed ?? 0);
      if (quantity > 0) into.set(typeId, (into.get(typeId) ?? 0) + quantity);
    }
    if (item.items) addItems(into, item.items);
  }
}

/** The hull plus everything on the killmail, dropped or destroyed, by type id. */
export function appraisalItems(victim: {
  shipTypeId: number;
  items: readonly KillmailItem[];
}): Map<number, number> {
  const items = new Map<number, number>([[victim.shipTypeId, 1]]);
  addItems(items, victim.items);
  return items;
}

// ESI inventory flags: racks are 8 flags each from LoSlot0 11, MedSlot0 19, HiSlot0 27, RigSlot0 92,
// SubSystem0 125; DroneBay 87. Cargo (5) and hangars are not "ship and fit".
const FIT_RACK_BASES = [11, 19, 27, 92, 125] as const;
const isFitFlag = (flag: number): boolean =>
  flag === 87 || FIT_RACK_BASES.some((base) => flag >= base && flag < base + 8);

function addFitItems(into: Map<number, number>, items: readonly KillmailItem[]): void {
  for (const item of items) {
    const typeId = item.item_type_id;
    if (typeof typeId === 'number' && typeof item.flag === 'number' && isFitFlag(item.flag)) {
      const quantity = (item.quantity_dropped ?? 0) + (item.quantity_destroyed ?? 0);
      if (quantity > 0) into.set(typeId, (into.get(typeId) ?? 0) + quantity);
      if (item.items) addItems(into, item.items); // a module's loaded charge
    }
  }
}

/** The lost ship and its fit, apart: hull alone, then fitted modules, rigs and drones (no cargo). */
export function shipFitItems(victim: { shipTypeId: number; items: readonly KillmailItem[] }): {
  hull: Map<number, number>;
  fit: Map<number, number>;
} {
  const fit = new Map<number, number>();
  addFitItems(fit, victim.items);
  return { hull: new Map([[victim.shipTypeId, 1]]), fit };
}

/** A Doctrine Fit as an appraisal list: its hull, modules and rigs. */
export function doctrineItems(snapshot: DoctrineFitSnapshot): Map<number, number> {
  const items = new Map<number, number>([[snapshot.hullTypeId, 1]]);
  for (const id of [...snapshot.modules, ...snapshot.rigs]) items.set(id, (items.get(id) ?? 0) + 1);
  return items;
}

// --- Hull Rules -> pricing engine ------------------------------------------

export interface ClaimValues {
  killmailValue: number | null;
  appraisalValue: number | null;
}

/** The rule that applies: the hull's own beats its class's. */
export function matchedHullRule(
  rules: readonly HullRule[],
  hullTypeId: number,
  classId: number
): HullRule | null {
  return (
    rules.find((r) => r.scope === 'hull' && r.id === hullTypeId) ??
    rules.find((r) => r.scope === 'class' && r.id === classId) ??
    null
  );
}

function engineRule(rule: HullRule): SrpHullRule {
  switch (rule.kind) {
    case 'pay-fixed':
      return { mode: 'pay', fixedIsk: rule.iskAmount };
    case 'pay-percent':
      return { mode: 'pay' };
    case 'not-covered':
      return { mode: 'not-covered' };
    case 'officer-decides':
      return { mode: 'officer' };
  }
}

/**
 * The engine's input. A Pay: corp percent rule follows the corp's chain: its killmail percent,
 * then its Appraisal percent, each as the corp set it.
 */
export function pricingInput(
  settings: Pick<SrpSettings, 'killmailPct' | 'appraisalPct' | 'hullRules'>,
  hullTypeId: number,
  classId: number,
  values: ClaimValues
): SrpPricingInput {
  const hullRules: Record<number, SrpHullRule> = {};
  const classRules: Record<number, SrpHullRule> = {};
  for (const rule of settings.hullRules) {
    (rule.scope === 'hull' ? hullRules : classRules)[rule.id] = engineRule(rule);
  }
  return {
    hullTypeId,
    classId,
    hullRules,
    classRules,
    killmailValue: values.killmailValue,
    appraisalValue: values.appraisalValue,
    killmailPercent: settings.killmailPct,
    appraisalPercent: settings.appraisalPct,
  };
}

/**
 * A **Stock List** as a link code, so one pilot can hand the list to another
 * (a corp's market manager to its builders). Only the list travels — its name
 * and Stock Targets — never anything counted from the sender's assets: the
 * receiver saves a copy and counts it against their own.
 *
 * Wire format, before `encodeURIComponent`: `1|name|typeId:target,...`, ids
 * and quantities in base36. Plain text rather than deflated: a market list is
 * a few hundred items at most, and the Appraisal share decision
 * (`20260911-110045`) found base36 pairs short enough without compression.
 * Decoding never throws: a pasted code is player-controlled.
 */
import { MAX_STOCK_TARGET, type StockTarget } from './stockLists';

const VERSION = '1';
export const MAX_SHARED_ITEMS = 500;
const MAX_NAME_LENGTH = 100;

export interface SharedStockList {
  name: string;
  items: StockTarget[];
}

export function encodeStockListShare(list: SharedStockList): string {
  const pairs = list.items
    .slice(0, MAX_SHARED_ITEMS)
    .map((item) => `${item.typeId.toString(36)}:${item.target.toString(36)}`)
    .join(',');
  const name = list.name.replace(/\|/g, ' ').slice(0, MAX_NAME_LENGTH);
  return encodeURIComponent(`${VERSION}|${name}|${pairs}`);
}

function base36Int(text: string): number | null {
  if (!/^[0-9a-z]+$/.test(text)) return null;
  const value = parseInt(text, 36);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function decodeStockListShare(code: string): SharedStockList | null {
  let text: string;
  try {
    text = decodeURIComponent(code);
  } catch {
    return null;
  }
  const parts = text.split('|');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const name = parts[1].trim().slice(0, MAX_NAME_LENGTH);
  if (name === '') return null;
  const seen = new Set<number>();
  const items: StockTarget[] = [];
  for (const pair of parts[2].split(',')) {
    if (items.length >= MAX_SHARED_ITEMS) break;
    const [id, qty] = pair.split(':');
    const typeId = base36Int(id ?? '');
    const target = base36Int(qty ?? '');
    if (typeId === null || target === null || seen.has(typeId)) continue;
    seen.add(typeId);
    items.push({ typeId, target: Math.min(target, MAX_STOCK_TARGET) });
  }
  return items.length > 0 ? { name, items } : null;
}

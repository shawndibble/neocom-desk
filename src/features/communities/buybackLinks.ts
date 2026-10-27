/**
 * Which of this Character's contracts are a buyback Quote's (issue #4780), kept
 * on this device so the Contracts page can mark them without reading any
 * Community. The seller's sync and the buyer's panel write what they learn
 * here; nothing here is sent anywhere.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '@/db';

export interface BuybackLinkInfo {
  requestId: string;
  communityId: string;
  communityName: string;
  /** The Request as the board names it: "All ore + 2 more". */
  requestTitle: string;
  /** What the quote said, so a contract at another price can be marked. */
  quotedTotal: number;
}

const keyOf = (characterId: number) => `buybackLinks:${characterId}`;
/** Contracts remembered per Character: the oldest fall out first. */
const MAX_LINKS = 200;

type Stored = Record<string, BuybackLinkInfo>;

/** Adds what a sync learned about some contracts, keeping the newest `MAX_LINKS`. */
export async function rememberBuybackLinks(
  characterId: number,
  found: ReadonlyMap<number, BuybackLinkInfo>
): Promise<void> {
  if (found.size === 0) return;
  const stored = ((await db.settings.get(keyOf(characterId)))?.value ?? {}) as Stored;
  const merged: Stored = { ...stored };
  let changed = false;
  for (const [contractId, info] of found) {
    const before = merged[String(contractId)];
    if (before && JSON.stringify(before) === JSON.stringify(info)) continue;
    // Re-insert so the newest are last: object keys keep insertion order.
    delete merged[String(contractId)];
    merged[String(contractId)] = info;
    changed = true;
  }
  if (!changed) return;
  const keys = Object.keys(merged);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_LINKS))) delete merged[key];
  await db.settings.put({ key: keyOf(characterId), value: merged });
}

/** This Character's remembered buyback contracts, by contract id; empty until read. */
export function useBuybackLinks(characterId: number | null): ReadonlyMap<number, BuybackLinkInfo> {
  const stored = useLiveQuery(
    () => (characterId === null ? undefined : db.settings.get(keyOf(characterId))),
    [characterId]
  );
  // One map per read, not per render: every History row asks.
  return useMemo(() => {
    const value = (stored?.value ?? {}) as Stored;
    return new Map(Object.entries(value).map(([id, info]) => [Number(id), info]));
  }, [stored]);
}

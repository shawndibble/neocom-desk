import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '@/db';
import type { Translate } from '@/lib/translate';

export interface BuybackLinkInfo {
  requestId: string;
  communityId: string;
  communityName: string;
  requestTitle: string;
  quotedTotal: number;
}

const keyOf = (characterId: number) => `buybackLinks:${characterId}`;
const MAX_LINKS = 200;

type Stored = Record<string, BuybackLinkInfo>;

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
    delete merged[String(contractId)];
    merged[String(contractId)] = info;
    changed = true;
  }
  if (!changed) return;
  const keys = Object.keys(merged);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_LINKS))) delete merged[key];
  await db.settings.put({ key: keyOf(characterId), value: merged });
}

export function buybackCueText(t: Translate, link: BuybackLinkInfo): string {
  return t('contracts.buyback.cue', { title: link.requestTitle, community: link.communityName });
}

export function useBuybackLinks(characterId: number | null): ReadonlyMap<number, BuybackLinkInfo> {
  const stored = useLiveQuery(
    () => (characterId === null ? undefined : db.settings.get(keyOf(characterId))),
    [characterId]
  );
  return useMemo(() => {
    const value = (stored?.value ?? {}) as Stored;
    return new Map(Object.entries(value).map(([id, info]) => [Number(id), info]));
  }, [stored]);
}

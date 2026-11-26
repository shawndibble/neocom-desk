import {
  absorbWalletFires,
  contractCauseOf,
  type ContractCauseEventId,
  type WalletRevision,
} from '@/engine/walletCause';
import { occurrenceKey } from '@/engine/occurrenceKey';
import type { ContractNotificationFire, WalletNotificationFire } from '@/engine/notificationDiffs';
import type { AnyNotificationFire } from './pollDomains';

export type FoldChannel = 'feed' | 'browser';

export interface WalletFoldInput {
  fires: readonly AnyNotificationFire[];
  isEnabled: (channel: FoldChannel, eventId: ContractCauseEventId) => boolean;
  rowExists: (key: string) => Promise<boolean>;
  nowMs: number;
  foldEnabled: boolean;
  walletStandalone: boolean;
}

export interface WalletFoldResult {
  feedFires: AnyNotificationFire[];
  browserFires: AnyNotificationFire[];
  revisions: ContractNotificationFire[];
}

function contractKey(
  characterId: number,
  contractId: number,
  eventId: ContractCauseEventId,
  nowMs: number
): string {
  return occurrenceKey({ eventId, characterId, contractId }, nowMs);
}

function isUnheard(fire: AnyNotificationFire, walletStandalone: boolean): boolean {
  return (
    fire.eventId === 'walletBalanceChanged' &&
    (!walletStandalone || (fire as WalletNotificationFire).belowThreshold === true)
  );
}

export async function foldWalletFires(input: WalletFoldInput): Promise<WalletFoldResult> {
  const { fires, nowMs } = input;
  if (!input.foldEnabled) {
    const heard = fires.filter((fire) => !isUnheard(fire, input.walletStandalone));
    return { feedFires: heard, browserFires: heard, revisions: [] };
  }
  const existing = new Set<string>();
  for (const fire of fires) {
    if (fire.eventId !== 'walletBalanceChanged') continue;
    const cause = contractCauseOf(fire as WalletNotificationFire);
    if (cause === null) continue;
    const key = contractKey(fire.characterId, cause.contractId, cause.eventId, nowMs);
    if (!existing.has(key) && (await input.rowExists(key))) existing.add(key);
  }
  const alertExists = (cause: {
    characterId: number;
    contractId: number;
    eventId: ContractCauseEventId;
  }) => existing.has(contractKey(cause.characterId, cause.contractId, cause.eventId, nowMs));

  const feed = absorbWalletFires(fires, (id) => input.isEnabled('feed', id), alertExists);
  const browser = absorbWalletFires(
    fires,
    (id) => input.isEnabled('browser', id),
    () => false
  );
  return {
    feedFires: feed.fires.filter((fire) => !isUnheard(fire, input.walletStandalone)),
    browserFires: browser.fires.filter((fire) => !isUnheard(fire, input.walletStandalone)),
    revisions: feed.revisions.map((r: WalletRevision): ContractNotificationFire => ({
      eventId: r.eventId,
      characterId: r.characterId,
      contractId: r.contractId,
      walletChangeIsk: r.amountIsk,
    })),
  };
}

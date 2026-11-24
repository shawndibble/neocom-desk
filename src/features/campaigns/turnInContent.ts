/**
 * What `TurnInDetail` and `TurnInBreakdown` say (issue #6705), worked out
 * apart from the markup so it can be tested on its own: the reward figures,
 * which Participate line a Character gets, and why Set destination is blocked.
 *
 * Never a predicted close date, a token count or "multiples of N" advice
 * (the issue): faction tokens are only ever "+ faction tokens".
 */
import type { TFunction } from 'i18next';
import type { PermissionCellMarkStatus } from '@/components/ui/PermissionCellMark';
import type { ParticipateState } from '@/engine/campaigns/participation';
import type { TurnInOffer } from '@/engine/market/turnIn';
import type { TurnInTraderGroup } from '@/engine/market/turnInPile';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { createNumberFormat } from '@/lib/numberLocale';
import { appraisalMultibuyText } from '@/features/market/appraisalMultibuyText';

const lpFormat = createNumberFormat({ maximumFractionDigits: 2 });

/** "~60K": a Turn-in Reward is an estimate (LP at an LP Value), so it is never printed exact. */
export function approxIsk(isk: number): string {
  return `~${formatIskCompact(isk)}`;
}

/** "28,000 ISK + 40 LP (~32K)", or "(LP unpriced)" when nothing gives the LP an LP Value. */
export function rewardSplitText(offer: TurnInOffer, t: TFunction): string {
  const parts: string[] = [];
  if (offer.iskPerItem > 0) {
    parts.push(t('campaigns.turnIn.splitIsk', { isk: formatIsk(offer.iskPerItem) }));
  }
  if (offer.lpPerItem > 0) {
    const lp = lpFormat(offer.lpPerItem);
    parts.push(
      offer.lpIskPerItem === null
        ? t('campaigns.turnIn.splitLpUnpriced', { lp })
        : t('campaigns.turnIn.splitLp', { lp, value: approxIsk(offer.lpIskPerItem) })
    );
  }
  return parts.join(' + ');
}

/** "Secure Strength Trader · Onnamon"; the trader alone when its system is unknown. */
export function traderPlace(traderName: string, systemName: string | null): string {
  return systemName ? `${traderName} · ${systemName}` : traderName;
}

/** "LP paid per full 100 items · + faction tokens"; only the tokens when it pays no LP. */
export function lpBlockText(offer: TurnInOffer, t: TFunction): string {
  return offer.lpBlockSize === null || offer.lpPerBlock === 0
    ? t('campaigns.turnIn.tokensOnly')
    : t('campaigns.turnIn.lpBlock', { count: offer.lpBlockSize });
}

/** Whole percent filled, never rounded up to a 100% that would mean closed. */
export function filledPercent(offer: Pick<TurnInOffer, 'filled'>): number {
  return Math.max(0, Math.min(99, Math.floor(offer.filled * 100)));
}

export type ParticipateLine =
  | { kind: 'participating' }
  | { kind: 'notSignedUp' }
  /** The caveat line; `mark` puts the Military Campaigns `GrantCellMark` by it. */
  | { kind: 'paysOnlyIf'; mark: boolean };

/**
 * The Participate line for one Character and objective. Only a granted
 * Military Campaigns Permission and a read that answered say yes or no;
 * everything else (no Character, missing, dismissed, still loading, a failed
 * read) is the caveat, with the mark only when the Permission is missing and
 * not dismissed.
 */
export function participateLine({
  characterId,
  permission,
  state,
}: {
  characterId: number | null;
  /** `usePermissionMark` for Military Campaigns; undefined while it is read. */
  permission: PermissionCellMarkStatus | undefined;
  /** `Participation.stateOf(objectiveId)`; undefined until it is read. */
  state: ParticipateState | undefined;
}): ParticipateLine {
  if (characterId === null || permission !== 'granted') {
    return { kind: 'paysOnlyIf', mark: characterId !== null && permission === 'missing' };
  }
  if (state === 'participating') return { kind: 'participating' };
  if (state === 'notParticipating') return { kind: 'notSignedUp' };
  return { kind: 'paysOnlyIf', mark: false };
}

export type DestinationBlock =
  | { kind: 'ready' }
  /** Autopilot waypoints missing: the `GrantCellMark` after the button, no words. */
  | { kind: 'mark' }
  /** The disabled button's tooltip; null says nothing (the grant is still being read). */
  | { kind: 'reason'; reason: 'noCharacter' | 'offline' | 'dismissed' | null };

/** Why Set destination can't send, as the button shows it. */
export function destinationBlock({
  characterId,
  lacksScope,
  offline,
  permission,
}: {
  characterId: number | null;
  /** `useSetDestination`'s `missingGroups` is non-empty. */
  lacksScope: boolean;
  offline: boolean;
  /** `usePermissionMark` for the waypoint endpoints. */
  permission: PermissionCellMarkStatus | undefined;
}): DestinationBlock {
  if (characterId === null) return { kind: 'reason', reason: 'noCharacter' };
  if (lacksScope) {
    if (permission === 'missing') return { kind: 'mark' };
    return { kind: 'reason', reason: permission === 'dismissed' ? 'dismissed' : null };
  }
  if (offline) return { kind: 'reason', reason: 'offline' };
  return { kind: 'ready' };
}

/** One Item Trader's items as EVE multibuy text ("Name<TAB>Qty"), the counted quantities. */
export function turnInGroupMultibuy(group: TurnInTraderGroup<TurnInOffer>): string {
  return appraisalMultibuyText(
    group.lines.map((line) => ({ name: line.name, quantity: line.reward.quantity }))
  );
}

export type PileParticipate =
  /** The per-item Participate column: Military Campaigns granted and the read answered. */
  | { kind: 'perItem' }
  /** One caveat line for the whole pile instead, with the mark while the Permission is missing. */
  | { kind: 'paysOnlyIf'; mark: boolean };

/** How `TurnInBreakdown` shows Participate for a pile: per item, or one caveat. */
export function pileParticipate({
  characterId,
  permission,
  answered,
}: {
  characterId: number | null;
  permission: PermissionCellMarkStatus | undefined;
  /** The Character's Participate read came back (`read.kind === 'ok'`). */
  answered: boolean;
}): PileParticipate {
  if (characterId !== null && permission === 'granted' && answered) return { kind: 'perItem' };
  return { kind: 'paysOnlyIf', mark: characterId !== null && permission === 'missing' };
}

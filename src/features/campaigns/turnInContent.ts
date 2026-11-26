import type { TFunction } from 'i18next';
import type { PermissionCellMarkStatus } from '@/components/ui/PermissionCellMark';
import type { ParticipateState } from '@/engine/campaigns/participation';
import type { TurnInOffer } from '@/engine/market/turnIn';
import type { TurnInTraderGroup } from '@/engine/market/turnInPile';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { createNumberFormat } from '@/lib/numberLocale';
import { appraisalMultibuyText } from '@/features/market/appraisalMultibuyText';

const lpFormat = createNumberFormat({ maximumFractionDigits: 2 });

export function approxIsk(isk: number): string {
  return `~${formatIskCompact(isk)}`;
}

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

export function traderPlace(traderName: string, systemName: string | null): string {
  return systemName ? `${traderName} · ${systemName}` : traderName;
}

export function lpBlockText(offer: TurnInOffer, t: TFunction): string {
  return offer.lpBlockSize === null || offer.lpPerBlock === 0
    ? t('campaigns.turnIn.tokensOnly')
    : t('campaigns.turnIn.lpBlock', { count: offer.lpBlockSize });
}

export function filledPercent(offer: Pick<TurnInOffer, 'filled'>): number {
  return Math.max(0, Math.min(99, Math.floor(offer.filled * 100)));
}

export type ParticipateLine =
  { kind: 'participating' } | { kind: 'notParticipating' } | { kind: 'paysOnlyIf'; mark: boolean };

export function participateLine({
  characterId,
  permission,
  state,
}: {
  characterId: number | null;
  permission: PermissionCellMarkStatus | undefined;
  state: ParticipateState | undefined;
}): ParticipateLine {
  if (characterId === null || permission !== 'granted') {
    return { kind: 'paysOnlyIf', mark: characterId !== null && permission === 'missing' };
  }
  if (state === 'participating') return { kind: 'participating' };
  if (state === 'notParticipating') return { kind: 'notParticipating' };
  return { kind: 'paysOnlyIf', mark: false };
}

export type DestinationBlock =
  | { kind: 'ready' }
  | { kind: 'mark' }
  | { kind: 'reason'; reason: 'noCharacter' | 'offline' | 'dismissed' | null };

export function destinationBlock({
  characterId,
  lacksScope,
  offline,
  permission,
}: {
  characterId: number | null;
  lacksScope: boolean;
  offline: boolean;
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

export function turnInGroupMultibuy(group: TurnInTraderGroup<TurnInOffer>): string {
  return appraisalMultibuyText(
    group.lines.map((line) => ({ name: line.name, quantity: line.reward.quantity }))
  );
}

export type PileParticipate = { kind: 'perItem' } | { kind: 'paysOnlyIf'; mark: boolean };

export function pileParticipate({
  characterId,
  permission,
  answered,
}: {
  characterId: number | null;
  permission: PermissionCellMarkStatus | undefined;
  answered: boolean;
}): PileParticipate {
  if (characterId !== null && permission === 'granted' && answered) return { kind: 'perItem' };
  return { kind: 'paysOnlyIf', mark: characterId !== null && permission === 'missing' };
}

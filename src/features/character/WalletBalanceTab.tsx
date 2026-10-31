import { formatCount } from '@/lib/formatCount';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CachedNotice, IconButton, InfoTooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { GrantBanner } from '@/app/GrantNote';
import { NetWorthPanel, type NetWorthCharacter } from '@/features/netWorth/NetWorthPanel';
import { WalletWaitingGoal } from '@/features/netWorth/WalletWaitingGoal';
import type { useWalletBalances } from '@/features/character/useWalletBalances';
import type { useWalletDrill } from '@/features/character/useWalletDrill';
import type { useWalletLoyalty } from '@/features/character/useWalletLoyalty';
import type { CachedResult } from '@/esi/cache';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';

interface WalletBalanceTabProps {
  activeCharacterId: number;
  /** The Character the net worth view is drilled into, if any. */
  drilledCharacter: NetWorthCharacter | undefined;
  activeCharacter: NetWorthCharacter | undefined;
  /** The `?char=` pick reaches beyond the active Character. */
  showingBeyondActive: boolean;
  pickedCharacters: NetWorthCharacter[];
  balances: ReturnType<typeof useWalletBalances>;
  drill: ReturnType<typeof useWalletDrill>;
  loyalty: ReturnType<typeof useWalletLoyalty>;
  balanceResult: CachedResult<number> | null;
  balanceNeedsReauth: boolean;
  /** The picked Characters' loyalty points, summed per corporation. */
  loyaltyResult: CachedResult<CharacterLoyaltyPoints[]> | null;
  loyaltyLoading: boolean;
  journalNeedsReauth: boolean;
  journalTruncated: boolean;
  oldestFetchedAt: Date | null;
  refreshCount: number;
}

/**
 * Wallet's Balance tab: the net worth panel — the active Character's, every
 * picked Character's, or the one drilled into — over the ISK waiting and Goal panels.
 */
export function WalletBalanceTab({
  activeCharacterId,
  drilledCharacter,
  activeCharacter,
  showingBeyondActive,
  pickedCharacters,
  balances,
  drill,
  loyalty,
  balanceResult,
  balanceNeedsReauth,
  loyaltyResult,
  loyaltyLoading,
  journalNeedsReauth,
  journalTruncated,
  oldestFetchedAt,
  refreshCount,
}: WalletBalanceTabProps) {
  const { t } = useTranslation();
  const { drillInto, leaveDrill, backButtonRef, panelHeadingRef } = drill;
  const drilledCharacters = useMemo(
    () =>
      drilledCharacter
        ? [{ characterId: drilledCharacter.characterId, name: drilledCharacter.name }]
        : [],
    [drilledCharacter]
  );
  const activeCharacters = useMemo(
    () =>
      activeCharacter
        ? [{ characterId: activeCharacter.characterId, name: activeCharacter.name }]
        : [],
    [activeCharacter]
  );
  const liveWallet = useMemo(() => {
    const map = new Map<number, { balance: number | null; needsReauth: boolean }>();
    for (const entry of balances.snapshot?.entries ?? []) {
      map.set(entry.characterId, {
        balance: entry.balanceResult?.data ?? null,
        needsReauth: entry.needsReauth,
      });
    }
    // The page already holds the active Character's own balance.
    if (!map.has(activeCharacterId)) {
      map.set(activeCharacterId, {
        balance: balanceResult?.data ?? null,
        needsReauth: balanceNeedsReauth,
      });
    }
    return map;
  }, [balances.snapshot, activeCharacterId, balanceResult, balanceNeedsReauth]);

  const waitingIds = useMemo(
    () =>
      drilledCharacter
        ? [drilledCharacter.characterId]
        : showingBeyondActive
          ? pickedCharacters.map((c) => c.characterId)
          : [activeCharacterId],
    [drilledCharacter, showingBeyondActive, pickedCharacters, activeCharacterId]
  );

  // Summed over the same picked Characters as the net worth panel.
  const everMarksStat = (
    <div>
      <p className={cx(eyebrowClassName, 'flex items-center gap-1')}>
        {t('wallet.everMarks')}
        <InfoTooltip
          label={t('wallet.everMarksTooltipLabel')}
          content={t('wallet.everMarksTooltip')}
        />
      </p>
      <p className="text-xl font-medium tabular-nums">
        {loyaltyResult && !loyaltyLoading ? formatCount(loyalty.everMarks) : t('common.unknown')}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/*
        The page header's Character picker drives which panel this is:
        unchanged for "This character", a per-character table + total for
        anything wider, or the one Character drilled into from that table.
      */}
      {drilledCharacter ? (
        <NetWorthPanel
          mode="single"
          drilled
          backRef={backButtonRef}
          characters={drilledCharacters}
          liveWallet={liveWallet}
          onDrill={drillInto}
          onBack={leaveDrill}
          headingRef={panelHeadingRef}
        />
      ) : showingBeyondActive ? (
        <NetWorthPanel
          mode="multi"
          characters={pickedCharacters}
          liveWallet={liveWallet}
          stats={everMarksStat}
          notices={
            balances.cachedAt !== null && (
              <CachedNotice
                className="mt-3"
                fetchedAt={balances.cachedAt}
                refreshFailed={balances.refreshCount > 0}
              />
            )
          }
          onDrill={drillInto}
          onBack={leaveDrill}
          headingRef={panelHeadingRef}
          actions={
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('wallet.refresh')}
              onClick={balances.refresh}
              disabled={balances.loading}
            />
          }
        />
      ) : (
        <NetWorthPanel
          mode="single"
          characters={activeCharacters}
          liveWallet={liveWallet}
          onDrill={drillInto}
          onBack={leaveDrill}
          headingRef={panelHeadingRef}
          stats={everMarksStat}
          notices={
            <>
              {balanceNeedsReauth && (
                <div className="mt-3">
                  <GrantBanner
                    characterId={activeCharacterId}
                    endpoints={['getCharacterWallet']}
                    title={t('wallet.reauthTitle')}
                    hint={t('wallet.reauthHint')}
                    actionLabel={t('wallet.reauthAction')}
                  />
                </div>
              )}
              {(balanceResult?.fromCache || loyaltyResult?.fromCache) && (
                <CachedNotice
                  className="mt-3"
                  fetchedAt={oldestFetchedAt}
                  refreshFailed={refreshCount > 0}
                />
              )}
              {journalNeedsReauth ? (
                <div className="mt-4">
                  <GrantBanner
                    characterId={activeCharacterId}
                    endpoints={['getCharacterWalletJournal']}
                    title={t('wallet.reauthTitle')}
                    hint={t('wallet.reauthHint')}
                    actionLabel={t('wallet.reauthAction')}
                  />
                </div>
              ) : (
                journalTruncated && (
                  <p className="mt-4 px-1 text-[0.6875rem] text-warning uppercase">
                    {t('common.incompleteTitle')} — {t('wallet.journalTruncatedHint')}
                  </p>
                )
              )}
            </>
          }
        />
      )}

      <WalletWaitingGoal characterIds={waitingIds} />
    </div>
  );
}

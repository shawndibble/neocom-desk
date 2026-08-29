import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { getCharacterWallet } from '@/esi/endpoints';
import { DataAgeBadge, EmptyState, Panel, Spinner, StatChip } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';

interface WalletSnapshot {
  balance: number;
  fetchedAt: Date;
}

const ISK_FORMAT = new Intl.NumberFormat('en', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Minimal dashboard for the active character. Grows with later milestones. */
export function Overview() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const character = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  // Keyed by character so a stale result (or reset) never needs a sync setState in the effect.
  const [walletResult, setWalletResult] = useState<{
    characterId: number;
    snapshot: WalletSnapshot | null;
  } | null>(null);

  useEffect(() => {
    if (activeCharacterId === null) return;
    let cancelled = false;
    getCharacterWallet(activeCharacterId)
      .then((result) => {
        if (!cancelled && result.data !== null) {
          setWalletResult({
            characterId: activeCharacterId,
            snapshot: { balance: result.data, fetchedAt: new Date() },
          });
        }
      })
      .catch(() => {
        if (!cancelled) setWalletResult({ characterId: activeCharacterId, snapshot: null });
      });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  const current = walletResult?.characterId === activeCharacterId ? walletResult : null;
  const wallet = current?.snapshot ?? null;
  const walletFailed = current !== null && current.snapshot === null;

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">
          {character?.name ?? t('common.unknown')}
        </h1>
        <div className="flex gap-2">
          <StatChip label={t('nav.skills')} value={t('nav.soon')} className="opacity-60" />
          <StatChip label={t('nav.industry')} value={t('nav.soon')} className="opacity-60" />
        </div>
      </header>

      <Panel
        title={t('overview.wallet')}
        actions={wallet ? <DataAgeBadge date={wallet.fetchedAt} /> : undefined}
      >
        {wallet ? (
          <p className="text-lg font-medium tabular-nums text-isk-pos">
            {ISK_FORMAT.format(wallet.balance)} {t('overview.isk')}
          </p>
        ) : walletFailed ? (
          <EmptyState title={t('overview.walletEmpty')} className="py-4" />
        ) : (
          <div className="flex justify-center py-4">
            <Spinner size="sm" label={t('common.loading')} />
          </div>
        )}
      </Panel>
    </div>
  );
}

/**
 * The loss an insurance payout in the wallet journal paid for: its fit, what it
 * cost and Open as Fitting, the same body as Pilot Lookup's loss rows. The
 * journal names no killmail, so the loss is found by time among the pilot's
 * zKillboard losses (`matchLossToPayout`). Opens only from the Wallet, never
 * from inside another modal; it lives in the journal row, so leaving the page
 * unmounts it, which is what closes it when Open as Fitting navigates.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Spinner } from '@/components/ui';
import { matchLossToPayout } from '@/engine/losses/netLoss';
import { KillmailBody, type Expanded } from '@/features/travel/KillmailBody';
import { loadKillmailFit } from '@/features/travel/pilotKillmailFit';
import { useTypeLabel } from '@/features/travel/useTypeLabel';
import { parseInstant } from '@/engine/esiInstant';
import { fetchPilotKillmailHistory, type PilotKillmail } from '@/lib/zkillboard';

type Found =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'none'; olderThanList: boolean }
  | { state: 'found'; entry: PilotKillmail; read: Expanded };

interface InsuranceLossModalProps {
  /** The journal line's `date`. */
  payoutDate: string;
  characterId: number;
  onClose: () => void;
}

export function InsuranceLossModal({ payoutDate, characterId, onClose }: InsuranceLossModalProps) {
  const { t } = useTranslation();
  const [found, setFound] = useState<Found>({ state: 'loading' });
  const typeLabel = useTypeLabel();

  useEffect(() => {
    let cancelled = false;
    const payoutMs = parseInstant(payoutDate);
    void (async () => {
      const history = await fetchPilotKillmailHistory(characterId);
      if (cancelled) return;
      if (!history.ok || payoutMs === null) return setFound({ state: 'failed' });
      const losses = history.entries.flatMap((entry) => {
        const timeMs = entry.side === 'loss' ? parseInstant(entry.detail?.time ?? undefined) : null;
        return timeMs === null ? [] : [{ entry, timeMs }];
      });
      const match = matchLossToPayout(losses, payoutMs);
      if (match === null) {
        const olderThanList = history.reachesBackTo !== null && payoutMs < history.reachesBackTo;
        return setFound({ state: 'none', olderThanList });
      }
      const read = await loadKillmailFit(match.entry);
      if (!cancelled) setFound({ state: 'found', entry: match.entry, read });
    })();
    return () => {
      cancelled = true;
    };
  }, [payoutDate, characterId]);

  return (
    <Modal open onClose={onClose} title={t('wallet.insuranceLoss.title')} placement="sheet">
      {found.state === 'loading' && (
        <Spinner size="sm" delayMs={200} label={t('wallet.insuranceLoss.loading')} />
      )}
      {found.state === 'failed' && (
        <p role="status" className="text-sm text-warning">
          {t('wallet.insuranceLoss.failed')}
        </p>
      )}
      {found.state === 'none' && (
        <p className="text-sm text-text-dim">
          {t(found.olderThanList ? 'wallet.insuranceLoss.noneOlder' : 'wallet.insuranceLoss.none')}
        </p>
      )}
      {found.state === 'found' && (
        <KillmailBody
          entry={found.entry}
          detail={found.entry.detail}
          read={found.read}
          typeLabel={typeLabel}
        />
      )}
    </Modal>
  );
}

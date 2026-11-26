import { useCallback, useState } from 'react';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/ui/Pill';
import { type PillTone } from '@/components/ui/Pill';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import type { Contract } from '@/esi/endpoints';
import type { QuoteContractStatus } from '@/engine/communities/buyback';
import { ContractDetailModal } from '@/features/character/ContractDetailModal';
import { contractIssuer, contractReceiver } from '@/features/character/contractCounterparty';
import { resolveNames } from '@/features/character/names';
import { formatAge } from '@/lib/age';
import { formatIsk } from '@/lib/isk';

export interface LinkedContractRow {
  contractId: number;
  status: QuoteContractStatus;
  contract?: Contract;
  unverified?: boolean;
  priceDiffers: boolean;
}

const TONE: Record<QuoteContractStatus, PillTone> = {
  outstanding: 'warning',
  inProgress: 'warning',
  finished: 'success',
  expired: 'neutral',
  rejected: 'danger',
};

const NO_NAMES: ReadonlyMap<number, string> = new Map();

export function QuoteContractList({
  rows,
  quotedTotal,
  viewerCharacterId,
  label,
  now,
}: {
  rows: readonly LinkedContractRow[];
  quotedTotal: number;
  viewerCharacterId: number;
  label: string;
  now: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Contract | null>(null);
  const loadNames = useCallback(() => {
    if (!open) return Promise.resolve(NO_NAMES);
    const receiver = contractReceiver(open, viewerCharacterId);
    return resolveNames([contractIssuer(open).id, ...(receiver ? [receiver.id] : [])]);
  }, [open, viewerCharacterId]);
  const names = useKeyedLoad(open ? String(open.contract_id) : null, loadNames).data ?? NO_NAMES;

  if (rows.length === 0) return null;
  const receiver = open ? contractReceiver(open, viewerCharacterId) : null;

  return (
    <>
      <ul aria-label={label} className="divide-y divide-line text-xs">
        {rows.map((row) => {
          const { contract } = row;
          const body = (
            <>
              <Pill tone={TONE[row.status]}>
                {t(`communities.board.buyback.contractStatus.${row.status}`)}
              </Pill>
              {contract?.price !== undefined && (
                <span className="tabular-nums">{formatIsk(contract.price)} ISK</span>
              )}
              {contract && (
                <span className="text-text-dim">
                  {t('communities.board.buyback.contractIssued', {
                    age: formatAge(now - Date.parse(contract.date_issued), t),
                  })}
                </span>
              )}
              {!contract && (
                <span className="text-text-dim">
                  {t('communities.board.buyback.linked', { id: row.contractId })}
                </span>
              )}
              {row.unverified && (
                <span className="text-text-dim">{t('communities.board.buyback.unverified')}</span>
              )}
              {row.priceDiffers && (
                <span className="basis-full text-warning">
                  {t('communities.board.buyback.priceDiffers', { quoted: formatIsk(quotedTotal) })}
                </span>
              )}
            </>
          );
          return (
            <li key={row.contractId}>
              {contract ? (
                <button
                  type="button"
                  onClick={() => setOpen(contract)}
                  className={cx(
                    'flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-left',
                    tappableRowClassName,
                    rowInteractiveClassName,
                    focusRingInsetClassName
                  )}
                >
                  {body}
                </button>
              ) : (
                <div
                  className={cx(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5',
                    tappableRowClassName
                  )}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <ContractDetailModal
          characterId={viewerCharacterId}
          contract={open}
          issuerName={names.get(contractIssuer(open).id) ?? `#${contractIssuer(open).id}`}
          receiver={receiver}
          receiverName={receiver ? (names.get(receiver.id) ?? `#${receiver.id}`) : ''}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

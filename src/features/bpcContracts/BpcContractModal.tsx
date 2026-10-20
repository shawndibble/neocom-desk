/**
 * BPC Search's contract-row detail, wording `PublicContractDetailModal`'s
 * header for a blueprint listing specifically (price, ME/TE, runs, quantity —
 * dimensions that mean nothing for a plain item contract). Everything below
 * that header — location, expiry, contract id, contents — is generic and
 * lives in the shared modal.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import { PublicContractDetailModal } from '@/features/contracts/PublicContractDetailModal';
import { bpcPerRunCheck } from '@/engine/contracts/bpcPerRunCheck';
import { effectivePrice, iskPerRun, type BpcContractRow } from '@/engine/contracts/bpcSearch';

export interface BpcContractModalProps {
  row: BpcContractRow;
  /**
   * The other listings of this blueprint on the board, which the copy is held
   * against per run. The row itself may be among them; it is left out.
   */
  comparables?: readonly BpcContractRow[];
  characterId: number;
  blueprintName: string;
  regionName: string;
  onClose: () => void;
}

export function BpcContractModal({
  row,
  comparables = [],
  characterId,
  blueprintName,
  regionName,
  onClose,
}: BpcContractModalProps) {
  const { t } = useTranslation();

  // A PLEX ask is stated as the contract states it — its ISK `price` is
  // usually 0, which on its own would read as a free blueprint (issue #1105).
  const priceLabel = row.requestedPlex
    ? row.price > 0
      ? t('bpcContracts.iskPlusPlexPrice', {
          isk: formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW),
          plex: row.requestedPlex.toLocaleString(),
        })
      : t('bpcContracts.plexPrice', { plex: row.requestedPlex.toLocaleString() })
    : row.isAuction
      ? row.buyout !== undefined
        ? t('bpcContracts.buyout', { price: formatIskAuto(row.buyout, CONTRACT_ISK_CENTS_BELOW) })
        : t('bpcContracts.startingBid', {
            price: formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW),
          })
      : formatIskAuto(row.price, CONTRACT_ISK_CENTS_BELOW);

  // A copy has no market price, so it is held per run against similar copies.
  const check = useMemo(() => bpcPerRunCheck(row, comparables), [row, comparables]);
  const perRun = iskPerRun(effectivePrice(row), row.runs, row.quantity, row.isMultiType);
  const searchedTypeIds = useMemo(() => new Set([row.typeId]), [row.typeId]);

  return (
    <PublicContractDetailModal
      title={blueprintName}
      characterId={characterId}
      contractId={row.contractId}
      locationId={row.locationId}
      regionName={regionName}
      dateExpired={row.dateExpired}
      statChips={[
        { label: t('bpcContracts.priceLabel'), value: priceLabel },
        ...(perRun === null
          ? []
          : [
              {
                label: t('bpcContracts.perRunLabel'),
                value: formatIskAuto(perRun, CONTRACT_ISK_CENTS_BELOW),
              },
            ]),
        { label: t('bpcContracts.meTeLabel'), value: `${row.me} / ${row.te}` },
        { label: t('bpcContracts.runsLabel'), value: String(row.runs) },
        { label: t('bpcContracts.qtyLabel'), value: String(row.quantity) },
      ]}
      bpcCheck={check}
      searchedTypeIds={searchedTypeIds}
      onClose={onClose}
    />
  );
}

/**
 * BPC Search's contract-row detail, wording `PublicContractDetailModal`'s
 * header for a blueprint listing specifically (price, ME/TE, runs, quantity —
 * dimensions that mean nothing for a plain item contract). Everything below
 * that header — location, expiry, contract id, contents — is generic and
 * lives in the shared modal.
 */
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { PublicContractDetailModal } from '@/features/contracts/PublicContractDetailModal';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';

export interface BpcContractModalProps {
  row: BpcContractRow;
  characterId: number;
  blueprintName: string;
  regionName: string;
  onClose: () => void;
}

export function BpcContractModal({
  row,
  characterId,
  blueprintName,
  regionName,
  onClose,
}: BpcContractModalProps) {
  const { t } = useTranslation();

  const priceLabel = row.isAuction
    ? row.buyout !== undefined
      ? t('bpcContracts.buyout', { price: formatIsk(row.buyout, 2) })
      : t('bpcContracts.startingBid', { price: formatIsk(row.price, 2) })
    : formatIsk(row.price, 2);

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
        { label: t('bpcContracts.meTeLabel'), value: `${row.me} / ${row.te}` },
        { label: t('bpcContracts.runsLabel'), value: String(row.runs) },
        { label: t('bpcContracts.qtyLabel'), value: String(row.quantity) },
      ]}
      onClose={onClose}
    />
  );
}

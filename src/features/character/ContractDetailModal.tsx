/**
 * Contract detail: everything the in-game contract window shows for one
 * contract, mounted only while selected (`EventDetailModal`'s pattern). The
 * summary fields (type, status, issuer, dates, ISK) are already on the
 * `Contract` the caller has in hand, so those render immediately; only the
 * location name(s) and item lines need an ESI round trip, so each gets its
 * own small loading state rather than blocking the whole modal.
 *
 * Labeled from ESI's own fields, not the game's "Buyer Will Pay/Get" framing
 * — that flips depending on which side of the trade this character is on.
 * `price` is what the acceptor pays, `reward` is what the acceptor receives;
 * items split on `is_included` into what the issuer hands over ("Included")
 * vs what the acceptor must supply ("Requested").
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, Modal, Spinner, type DataTableColumn } from '@/components/ui';
import { loadContractItems } from './contractItems';
import { loadContractLocationName } from './contractLocationName';
import { loadTypeNames } from './typeNames';
import {
  CONTRACT_AVAILABILITY_KEY,
  CONTRACT_STATUS_KEY,
  CONTRACT_TYPE_KEY,
} from './contractLabels';
import { typeIconUrl } from '@/lib/eveImages';
import { formatIsk } from '@/lib/isk';
import type { Contract, ContractItem } from '@/esi/endpoints';

export interface ContractDetailModalProps {
  characterId: number;
  contract: Contract;
  issuerName: string;
  onClose: () => void;
}

interface LocationState {
  start: string | null;
  end: string | null;
}

interface ItemsState {
  list: ContractItem[];
  typeNames: Map<number, string>;
}

const HAS_ITEMS = new Set<Contract['type']>(['item_exchange', 'auction']);

export function ContractDetailModal({
  characterId,
  contract,
  issuerName,
  onClose,
}: ContractDetailModalProps) {
  const { t } = useTranslation();
  const [location, setLocation] = useState<LocationState | undefined>(undefined);
  /** Stays `undefined` forever for a courier/loan contract — `HAS_ITEMS` gates both the fetch and the render, so it's never inspected there. */
  const [items, setItems] = useState<ItemsState | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLocation(undefined);
      const [start, end] = await Promise.all([
        contract.start_location_id
          ? loadContractLocationName(characterId, contract.start_location_id)
          : Promise.resolve(null),
        contract.end_location_id
          ? loadContractLocationName(characterId, contract.end_location_id)
          : Promise.resolve(null),
      ]);
      if (!cancelled) setLocation({ start, end });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, contract.start_location_id, contract.end_location_id]);

  useEffect(() => {
    if (!HAS_ITEMS.has(contract.type)) return;
    let cancelled = false;
    void (async () => {
      setItems(undefined);
      const result = await loadContractItems(characterId, contract.contract_id);
      const list = result?.data ?? [];
      const typeNames = await loadTypeNames(list.map((item) => item.type_id));
      if (!cancelled) setItems({ list, typeNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId, contract.type, contract.contract_id]);

  const title = contract.title || t(CONTRACT_TYPE_KEY[contract.type]);

  const included = items?.list.filter((item) => item.is_included) ?? [];
  const requested = items?.list.filter((item) => !item.is_included) ?? [];
  // Built once per render (not once per table) — both Included and Requested share it.
  // Two columns, one of them a bare number: this is the narrow case
  // `responsive="table"` exists for. Stacking would title each card with the
  // item name and then spend a 6.5rem gutter label on "QUANTITY: 744",
  // turning a scannable list into one card per item for no gain.
  const itemColumns: DataTableColumn<ContractItem>[] | undefined = items && [
    {
      id: 'name',
      header: t('contracts.detailItemName'),
      render: (item) => (
        <span className="flex items-center gap-1.5">
          <img
            src={typeIconUrl(item.type_id, 32)}
            alt=""
            width={20}
            height={20}
            className="shrink-0 rounded-xs border border-line"
          />
          {items.typeNames.get(item.type_id) ?? `#${item.type_id}`}
        </span>
      ),
    },
    {
      id: 'quantity',
      header: t('contracts.detailQuantity'),
      align: 'right',
      className: 'tabular-nums',
      render: (item) => item.quantity.toLocaleString(),
    },
  ];

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4 text-xs">
        <div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-text-dim uppercase">{t('contracts.detailType')}</dt>
            <dd>{t(CONTRACT_TYPE_KEY[contract.type])}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailStatus')}</dt>
            <dd>{t(CONTRACT_STATUS_KEY[contract.status])}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailIssuedBy')}</dt>
            <dd>{issuerName}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailAvailability')}</dt>
            <dd>{t(CONTRACT_AVAILABILITY_KEY[contract.availability])}</dd>

            {contract.start_location_id && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailLocation')}</dt>
                <dd>
                  {location === undefined ? (
                    <Spinner size="sm" label={t('common.loading')} />
                  ) : (
                    (location.start ?? `#${contract.start_location_id}`)
                  )}
                </dd>
              </>
            )}

            {contract.end_location_id && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDestination')}</dt>
                <dd>
                  {location === undefined ? (
                    <Spinner size="sm" label={t('common.loading')} />
                  ) : (
                    (location.end ?? `#${contract.end_location_id}`)
                  )}
                </dd>
              </>
            )}

            <dt className="text-text-dim uppercase">{t('contracts.detailDateIssued')}</dt>
            <dd>{new Date(contract.date_issued).toLocaleString()}</dd>

            <dt className="text-text-dim uppercase">{t('contracts.detailDateExpired')}</dt>
            <dd>{new Date(contract.date_expired).toLocaleString()}</dd>

            {contract.date_accepted && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDateAccepted')}</dt>
                <dd>{new Date(contract.date_accepted).toLocaleString()}</dd>
              </>
            )}

            {contract.date_completed && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDateCompleted')}</dt>
                <dd>{new Date(contract.date_completed).toLocaleString()}</dd>
              </>
            )}

            {contract.days_to_complete !== undefined && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailDaysToComplete')}</dt>
                <dd>{contract.days_to_complete}</dd>
              </>
            )}

            {contract.volume !== undefined && (
              <>
                <dt className="text-text-dim uppercase">{t('contracts.detailVolume')}</dt>
                <dd>{contract.volume.toLocaleString()} m³</dd>
              </>
            )}
          </dl>
        </div>

        {(contract.price !== undefined ||
          contract.reward !== undefined ||
          contract.collateral !== undefined ||
          contract.buyout !== undefined) && (
          <dl className="divide-y divide-line border-y border-line">
            {contract.price !== undefined && (
              <IskRow label={t('contracts.detailPrice')} value={contract.price} />
            )}
            {contract.reward !== undefined && (
              <IskRow label={t('contracts.detailReward')} value={contract.reward} />
            )}
            {contract.collateral !== undefined && (
              <IskRow label={t('contracts.detailCollateral')} value={contract.collateral} />
            )}
            {contract.buyout !== undefined && (
              <IskRow label={t('contracts.detailBuyout')} value={contract.buyout} />
            )}
          </dl>
        )}

        {HAS_ITEMS.has(contract.type) &&
          (items === undefined ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" label={t('common.loading')} />
            </div>
          ) : items.list.length === 0 ? (
            <EmptyState title={t('contracts.detailNoItems')} className="py-4" />
          ) : (
            <>
              {included.length > 0 && itemColumns && (
                <div>
                  <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('contracts.detailItemsIncluded')}
                  </h3>
                  <div className="overflow-x-auto">
                    <DataTable
                      label={t('contracts.detailItemsIncluded')}
                      columns={itemColumns}
                      rows={included}
                      rowKey={(item) => item.record_id}
                      density="compact"
                      responsive="table"
                    />
                  </div>
                </div>
              )}
              {requested.length > 0 && itemColumns && (
                <div>
                  <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('contracts.detailItemsRequested')}
                  </h3>
                  <div className="overflow-x-auto">
                    <DataTable
                      label={t('contracts.detailItemsRequested')}
                      columns={itemColumns}
                      rows={requested}
                      rowKey={(item) => item.record_id}
                      density="compact"
                      responsive="table"
                    />
                  </div>
                </div>
              )}
            </>
          ))}
      </div>
    </Modal>
  );
}

/**
 * Neutral color, not `isk-pos`/`isk-neg` — those tokens signal gain/loss
 * *to this character*, but a `Contract` alone doesn't say whether the active
 * character is the issuer or the acceptor, so "Acceptor Pays" could be this
 * character's outflow or the other side's. Coloring it as a gain either way
 * would be a wrong signal, not just a missing one.
 */
function IskRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-text-dim">{label}</span>
      <span className="tabular-nums font-semibold">{formatIsk(value, 2)}</span>
    </div>
  );
}

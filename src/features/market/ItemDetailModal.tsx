/**
 * Item Detail (CONTEXT.md round 6): fitting cost, volume, bonuses and
 * description for one item — the things a shopper checks before deciding
 * whether a price is worth paying. Read live from ESI on open, the one
 * Market Browser panel that needs the network for its own content — baking
 * every item's attributes into the snapshot would ship a slice of a 16 MB
 * table for a panel that is rarely opened. The snapshot instead carries the
 * small attribute dictionary that turns attribute ids into names/units/categories.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { groupItemAttributes, type AttributeGroup } from '@/engine/market/itemAttributes';
import { getUniverseType, type UniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { typeIconUrl } from '@/lib/eveImages';
import { formatAttributeValue, formatVolume } from './format';

export interface ItemDetailModalProps {
  typeId: number;
  itemName: string;
  onClose: () => void;
}

interface DetailData {
  type: UniverseType;
  groups: AttributeGroup[];
}

/** Mounted only while open (ImportClipboardDialog's pattern) — mounting is the open signal. */
export function ItemDetailModal({ typeId, itemName, onClose }: ItemDetailModalProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      try {
        const [{ data: type }, dictionary] = await Promise.all([
          getUniverseType(typeId),
          loadAttributeDictionary(),
        ]);
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        setData({ type, groups: groupItemAttributes(type.dogma_attributes, dictionary) });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  return (
    <Modal open onClose={onClose} title={itemName}>
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error || !data ? (
        <EmptyState
          title={t('market.itemDetail.errorTitle')}
          hint={t('market.itemDetail.errorHint')}
          className="py-8"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <img
              src={typeIconUrl(typeId, 64)}
              alt=""
              width={64}
              height={64}
              className="shrink-0 rounded-xs border border-line"
            />
            <div className="space-y-1 text-xs">
              <p className="text-text-dim">
                {t('market.itemDetail.volume', { volume: formatVolume(data.type.volume ?? 0) })}
              </p>
              {data.type.description && (
                <p className="whitespace-pre-line text-text">{data.type.description}</p>
              )}
            </div>
          </div>

          {data.groups.length === 0 ? (
            <p className="text-xs text-text-dim">{t('market.itemDetail.noAttributes')}</p>
          ) : (
            data.groups.map((group) => (
              <div key={group.category}>
                <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {group.category}
                </h3>
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                  {group.attributes.map((attribute) => (
                    <div key={attribute.attributeId} className="contents">
                      <dt className="text-text-dim">{attribute.name}</dt>
                      <dd className="text-right text-text">
                        {formatAttributeValue(attribute.value)}
                        {attribute.unit ? ` ${attribute.unit}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

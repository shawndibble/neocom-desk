/**
 * Item Detail (CONTEXT.md round 6): fitting cost, volume, bonuses and
 * description for one item — the things a shopper checks before deciding
 * whether a price is worth paying. Read live from ESI on open, the one
 * Market Browser panel that needs the network for its own content — baking
 * every item's attributes into the snapshot would ship a slice of a 16 MB
 * table for a panel that is rarely opened. The snapshot instead carries the
 * small attribute dictionary that turns attribute ids into names/units/categories.
 * Rows whose value is an id rather than a measurement — a required skill, a
 * Group a module can be fitted to — resolve to names through
 * `attributeReferenceNames.ts`, which starts from `skills.json` (public/data,
 * PWA-precached — not the market snapshot vite.config.ts excludes from
 * precache) and only reaches for ESI for ids no local payload covers. A
 * planetary commodity also gets its schematic (pi.json, precached the same
 * way): for those, "how is this made" is the question the modal is opened to
 * answer, and no dogma attribute carries it.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { groupItemAttributes, type AttributeGroup } from '@/engine/market/itemAttributes';
import { parseItemDescription, type DescriptionRun } from '@/engine/market/itemDescription';
import { summarizeOrderBook, type OrderBookSummary } from '@/engine/market/orderBook';
import { getUniverseType, type UniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { typeIconUrl } from '@/lib/eveImages';
import { formatIsk } from '@/lib/isk';
import { getTradeHub } from '@/market/hubs';
import { loadAttributeReferenceNames } from './attributeReferenceNames';
import { formatAttributeValue, formatVolume } from './format';
import { useMarketHub } from './hub';
import { getOrderBook } from './orderBook';

export interface ItemDetailModalProps {
  typeId: number;
  itemName: string;
  onClose: () => void;
}

interface DetailData {
  type: UniverseType;
  groups: AttributeGroup[];
  /** Null when pi.json couldn't be read — the rest of the modal is unaffected. */
  pi: PiData | null;
}

/**
 * Distinct from a plain `OrderBookSummary | null`: a region with truly no
 * orders is a valid `'ready'` result (both sides null), which must render
 * differently from `'error'` (the fetch itself failed) — nullability alone
 * can't tell those apart.
 */
type PriceState =
  { status: 'loading' } | { status: 'ready'; summary: OrderBookSummary } | { status: 'error' };

/** Mounted only while open (ImportClipboardDialog's pattern) — mounting is the open signal. */
export function ItemDetailModal({ typeId, itemName, onClose }: ItemDetailModalProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const [priceState, setPriceState] = useState<PriceState>({ status: 'loading' });

  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);

  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    const regionId = getTradeHub(hubId)?.regionId;
    void (async () => {
      setPriceState({ status: 'loading' });
      try {
        if (regionId === undefined) throw new Error(`Unknown hub ${hubId}`);
        const { orders } = await getOrderBook(regionId, typeId);
        if (cancelled) return;
        setPriceState({ status: 'ready', summary: summarizeOrderBook(orders) });
      } catch {
        // A nice-to-have fetch, same as the PI schematic below: its failure
        // costs the price row, never the whole modal.
        if (!cancelled) setPriceState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId, hubId, hubHydrated]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setData(null);
      setError(false);
      try {
        const [{ data: type }, dictionary, pi] = await Promise.all([
          getUniverseType(typeId),
          loadAttributeDictionary(),
          // Caught here, not by the shared handler below: only planetary
          // commodities have anything to lose if this payload is missing, and
          // a rejection inside the Promise.all would blank the whole modal.
          loadPi().catch(() => null),
        ]);
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        // Needs the dictionary to know which values are ids, so it can't join
        // the fetch above; it never rejects, so it can't blank the modal.
        const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
        if (cancelled) return;
        setData({
          type,
          groups: groupItemAttributes(type.dogma_attributes, dictionary, names),
          pi,
        });
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
              {priceState.status !== 'error' && (
                <p className="flex gap-4 text-text-dim">
                  <span>
                    {t('market.itemDetail.bestSell')}{' '}
                    <span className="tabular-nums text-text">
                      {priceState.status === 'loading'
                        ? '…'
                        : priceCellText(priceState.summary.bestSell)}
                    </span>
                  </span>
                  <span>
                    {t('market.itemDetail.bestBuy')}{' '}
                    <span className="tabular-nums text-text">
                      {priceState.status === 'loading'
                        ? '…'
                        : priceCellText(priceState.summary.bestBuy)}
                    </span>
                  </span>
                </p>
              )}
              {data.type.description && (
                <p className="whitespace-pre-line text-text">
                  {parseItemDescription(data.type.description).map((run, i) => (
                    <DescriptionRunNode key={i} run={run} />
                  ))}
                </p>
              )}
            </div>
          </div>

          <PlanetaryProduction pi={data.pi} typeId={typeId} />

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
                        {attribute.displayValue ??
                          `${formatAttributeValue(attribute.value, attribute.unit)}${attribute.unit ? ` ${attribute.unit}` : ''}`}
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

/** A side of the order book with no orders renders as '—', matching CompareDrawer/VariationsTable. */
function priceCellText(price: number | null): string {
  return price != null ? formatIsk(price, 2) : '—';
}

/**
 * How a planetary commodity is produced: the schematic's inputs, its cycle
 * time and what one cycle yields. A P0 resource has no schematic — an
 * extractor pulls it off the planet — so it gets the one line that says so,
 * and everything else in New Eden renders nothing here.
 */
function PlanetaryProduction({ pi, typeId }: { pi: PiData | null; typeId: number }) {
  const { t } = useTranslation();
  if (!pi) return null;
  const schematic = pi.schematics[String(typeId)];
  const raw = pi.raw.some((resource) => resource.typeID === typeId);
  if (!schematic && !raw) return null;
  return (
    <div>
      <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.itemDetail.planetaryTitle')}
      </h3>
      {schematic ? (
        <>
          <p className="mt-1 text-xs text-text-dim">
            {t('market.itemDetail.planetaryCycle', {
              quantity: schematic.quantity.toLocaleString(),
              duration: formatDuration(schematic.cycleTime),
            })}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-text">
            {schematic.inputs.map((input) => (
              <li key={input.typeID}>
                {t('market.itemDetail.planetaryInput', {
                  quantity: input.quantity.toLocaleString(),
                  name: input.name,
                })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-xs text-text-dim">{t('market.itemDetail.planetaryRaw')}</p>
      )}
    </div>
  );
}

/** Renders one parsed description run as nested inline elements — never `dangerouslySetInnerHTML`. */
function DescriptionRunNode({ run }: { run: DescriptionRun }) {
  let node: ReactNode = run.text;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <i>{node}</i>;
  if (run.bold) node = <b>{node}</b>;
  return <Fragment>{node}</Fragment>;
}

/**
 * Item Detail (CONTEXT.md round 6): fitting cost, volume, bonuses and
 * description for one item — the things a shopper checks before deciding
 * whether a price is worth paying. Read live from ESI on open, the one
 * Market Browser panel that needs the network for its own content — baking
 * every item's attributes into the snapshot would ship a slice of a 16 MB
 * table for a panel that is rarely opened. The snapshot instead carries the
 * small attribute dictionary that turns attribute ids into names/units/categories.
 * Required-skill rows resolve their skill name from `skills.json`
 * (public/data, PWA-precached — not the market snapshot vite.config.ts
 * excludes from precache) rather than from anything item-specific. A
 * planetary commodity also gets its schematic (pi.json, precached the same
 * way): for those, "how is this made" is the question the modal is opened to
 * answer, and no dogma attribute carries it.
 */
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { groupItemAttributes, type AttributeGroup } from '@/engine/market/itemAttributes';
import { parseItemDescription, type DescriptionRun } from '@/engine/market/itemDescription';
import { getUniverseType, type UniverseType } from '@/esi/endpoints';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import { loadPi, loadSkills } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
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
  /** Null when pi.json couldn't be read — the rest of the modal is unaffected. */
  pi: PiData | null;
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
        const [{ data: type }, dictionary, skills, pi] = await Promise.all([
          getUniverseType(typeId),
          loadAttributeDictionary(),
          loadSkills(),
          // Caught here, not by the shared handler below: only planetary
          // commodities have anything to lose if this payload is missing, and
          // a rejection inside the Promise.all would blank the whole modal.
          loadPi().catch(() => null),
        ]);
        if (cancelled) return;
        if (!type) throw new Error(`No type data for ${typeId}`);
        const skillNames = Object.fromEntries(skills.map((s) => [s.typeID, s.name]));
        setData({
          type,
          groups: groupItemAttributes(type.dogma_attributes, dictionary, skillNames),
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
                          `${formatAttributeValue(attribute.value)}${attribute.unit ? ` ${attribute.unit}` : ''}`}
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
  const raw = pi.raw.includes(typeId);
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

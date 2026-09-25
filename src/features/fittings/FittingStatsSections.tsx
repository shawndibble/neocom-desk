import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsiblePanel } from '@/components/ui';
import { overheatedOrNull, resistPct } from '@/engine/fittings/stats';
import type { FittingStats, LayerDefense, LocalRepair, WeaponRow } from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import type { DogmaAssetProgress } from './dogmaFittingEngine';

const DMG_RESIST_CLASS = {
  em: 'bg-dmg-em',
  thermal: 'bg-dmg-thermal',
  kinetic: 'bg-dmg-kinetic',
  explosive: 'bg-dmg-explosive',
} as const;

type DamageType = keyof typeof DMG_RESIST_CLASS;

function ResistBar({ type, resonance }: { type: DamageType; resonance: number }) {
  const { t } = useTranslation();
  const pct = resistPct(resonance);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-text-dim">{t(`fittings.stats.damageType.${type}`)}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className={`h-full rounded-full ${DMG_RESIST_CLASS[type]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-text-dim">{pct.toFixed(0)}%</span>
    </div>
  );
}

function LayerCard({ title, layer }: { title: string; layer: LayerDefense }) {
  return (
    <div className="space-y-1 rounded-xs bg-panel-2 p-2">
      <p className="text-xs font-semibold text-text-dim">
        {title} — {layer.hp.toFixed(0)} HP
      </p>
      <ResistBar type="em" resonance={layer.emResonance} />
      <ResistBar type="thermal" resonance={layer.thermalResonance} />
      <ResistBar type="kinetic" resonance={layer.kineticResonance} />
      <ResistBar type="explosive" resonance={layer.explosiveResonance} />
    </div>
  );
}

/**
 * An overheated value beside its normal one, in the warning tone — the
 * game marks heat the same way. Renders nothing when `value` is null.
 */
function Overheated({ value, digits }: { value: number | null; digits: number }) {
  const { t } = useTranslation();
  if (value === null) return null;
  return (
    <span className="ml-1 text-warning">
      {t('fittings.stats.overheated', { value: value.toFixed(digits) })}
    </span>
  );
}

function DamageFigures({
  dps,
  volley,
  overheatedDps,
  overheatedVolley,
}: Pick<WeaponRow, 'dps' | 'volley' | 'overheatedDps' | 'overheatedVolley'>) {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 text-right">
      <span>{t('fittings.stats.weaponDps', { value: dps.toFixed(1) })}</span>
      <Overheated value={overheatedOrNull(dps, overheatedDps, 1)} digits={1} />
      <span className="text-text-dim"> · </span>
      <span>{t('fittings.stats.weaponVolley', { value: volley.toFixed(0) })}</span>
      <Overheated value={overheatedOrNull(volley, overheatedVolley, 0)} digits={0} />
    </span>
  );
}

const REPAIR_LAYERS: readonly (keyof LocalRepair)[] = ['shield', 'armor', 'hull'];

const SECTIONS = [
  'capacitor',
  'offense',
  'defense',
  'targeting',
  'navigation',
  'drones',
  'fitting',
  'price',
] as const;
type Section = (typeof SECTIONS)[number];

interface FittingStatsSectionsProps {
  stats: FittingStats | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  price: Appraisal | null;
  /** Names an Offense row's weapon, charge or drone. */
  typeName: (typeId: number) => string;
}

export function FittingStatsSections({
  stats,
  statsProgress,
  statsError,
  price,
  typeName,
}: FittingStatsSectionsProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<Section, boolean>>(
    () => Object.fromEntries(SECTIONS.map((section) => [section, true])) as Record<Section, boolean>
  );
  const toggle = (section: Section) =>
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  const downloadPct =
    statsProgress?.totalBytes && statsProgress.totalBytes > 0
      ? Math.round((statsProgress.loadedBytes / statsProgress.totalBytes) * 100)
      : null;

  const placeholder = statsError ? (
    <p className="text-xs text-danger">{t('fittings.stats.error')}</p>
  ) : (
    <p className="text-xs text-text-dim">
      {downloadPct === null
        ? t('fittings.stats.loadingIndeterminate')
        : t('fittings.stats.loading', { pct: downloadPct })}
    </p>
  );

  function section(id: Section, meta: string | undefined, body: ReactNode) {
    return (
      <CollapsiblePanel
        title={t(`fittings.stats.section.${id}`)}
        meta={meta}
        expanded={expanded[id]}
        onToggle={() => toggle(id)}
        labels={{ show: t('fittings.stats.show'), hide: t('fittings.stats.hide') }}
      >
        {body}
      </CollapsiblePanel>
    );
  }

  return (
    <div className="space-y-2">
      {section(
        'capacitor',
        stats
          ? stats.capacitor.stable
            ? t('fittings.stats.capacitorStable', {
                pct: stats.capacitor.stablePercentage.toFixed(0),
              })
            : t('fittings.stats.capacitorDepletes', {
                seconds: stats.capacitor.depletesInSeconds.toFixed(0),
              })
          : undefined,
        stats ? (
          <div className="space-y-1 text-xs">
            <p>
              {t('fittings.stats.capacitorCapacity', { value: stats.capacitorCapacity.toFixed(0) })}
            </p>
            <p>
              {t('fittings.stats.capacitorRecharge', {
                seconds: (stats.capacitorRechargeTime / 1000).toFixed(0),
              })}
            </p>
          </div>
        ) : (
          placeholder
        )
      )}

      {section(
        'offense',
        stats && stats.offense.weapons.length > 0
          ? t('fittings.stats.weaponDps', { value: stats.offense.dps.toFixed(1) })
          : undefined,
        stats ? (
          stats.offense.weapons.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {stats.offense.weapons.map((row) => (
                <li
                  key={`${row.isDrone}:${row.typeId}:${row.chargeTypeId ?? ''}`}
                  className="flex flex-wrap justify-between gap-x-2"
                >
                  <span className="min-w-0">
                    <span>
                      {t('fittings.stats.weaponRow', {
                        count: row.count,
                        name: typeName(row.typeId),
                      })}
                    </span>
                    {row.chargeTypeId !== undefined && (
                      <span className="block text-text-dim">{typeName(row.chargeTypeId)}</span>
                    )}
                    {row.isDrone && (
                      <span className="block text-text-dim">
                        {t('fittings.stats.dronesNoOverheat')}
                      </span>
                    )}
                  </span>
                  <DamageFigures {...row} />
                </li>
              ))}
              <li className="flex justify-between gap-x-2 border-t border-line pt-1 font-semibold">
                <span>{t('fittings.stats.offenseTotal')}</span>
                <DamageFigures {...stats.offense} />
              </li>
            </ul>
          ) : (
            <p className="text-xs text-text-dim">{t('fittings.stats.offenseNone')}</p>
          )
        ) : (
          placeholder
        )
      )}

      {section(
        'defense',
        stats ? t('fittings.stats.defenseEhp', { value: stats.ehp.toFixed(0) }) : undefined,
        stats ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <LayerCard title={t('fittings.stats.shield')} layer={stats.shield} />
              <LayerCard title={t('fittings.stats.armor')} layer={stats.armor} />
              <LayerCard title={t('fittings.stats.hull')} layer={stats.hull} />
            </div>
            <ul className="space-y-1 text-xs text-text-dim">
              {overheatedOrNull(stats.ehp, stats.overheated?.ehp, 0) !== null && (
                <li>
                  {t('fittings.stats.ehpLine', { value: stats.ehp.toFixed(0) })}
                  <Overheated
                    value={overheatedOrNull(stats.ehp, stats.overheated?.ehp, 0)}
                    digits={0}
                  />
                </li>
              )}
              {REPAIR_LAYERS.filter((layer) => stats.repair[layer] > 0).map((layer) => (
                <li key={layer}>
                  {t(`fittings.stats.repair.${layer}`, { value: stats.repair[layer].toFixed(1) })}
                  <Overheated
                    value={overheatedOrNull(
                      stats.repair[layer],
                      stats.overheated?.repair[layer],
                      1
                    )}
                    digits={1}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          placeholder
        )
      )}

      {section(
        'targeting',
        undefined,
        stats ? (
          <ul className="space-y-1 text-xs text-text-dim">
            <li>
              {t('fittings.stats.maxTargetRange', {
                value: (stats.targeting.maxTargetRange / 1000).toFixed(1),
              })}
            </li>
            <li>
              {t('fittings.stats.maxLockedTargets', { value: stats.targeting.maxLockedTargets })}
            </li>
            <li>
              {t('fittings.stats.scanResolution', {
                value: stats.targeting.scanResolution.toFixed(0),
              })}
            </li>
            <li>
              {t('fittings.stats.signatureRadius', {
                value: stats.targeting.signatureRadius.toFixed(0),
              })}
            </li>
          </ul>
        ) : (
          placeholder
        )
      )}

      {section(
        'navigation',
        stats
          ? t('fittings.stats.maxVelocityMeta', { value: stats.navigation.maxVelocity.toFixed(0) })
          : undefined,
        stats ? (
          <ul className="space-y-1 text-xs text-text-dim">
            <li>
              {t('fittings.stats.maxVelocity', { value: stats.navigation.maxVelocity.toFixed(0) })}
              <Overheated
                value={overheatedOrNull(
                  stats.navigation.maxVelocity,
                  stats.overheated?.maxVelocity,
                  0
                )}
                digits={0}
              />
            </li>
            <li>{t('fittings.stats.agility', { value: stats.navigation.agility.toFixed(3) })}</li>
            <li>
              {t('fittings.stats.mass', { value: (stats.navigation.mass / 1000).toFixed(0) })}
            </li>
            <li>
              {t('fittings.stats.warpSpeed', { value: stats.navigation.warpSpeed.toFixed(1) })}
            </li>
          </ul>
        ) : (
          placeholder
        )
      )}

      {section(
        'drones',
        stats ? t('fittings.stats.droneDps', { value: stats.droneDps.toFixed(1) }) : undefined,
        stats ? (
          <ul className="space-y-1 text-xs text-text-dim">
            <li>{t('fittings.stats.droneDps', { value: stats.droneDps.toFixed(1) })}</li>
            <li>
              {t('fittings.stats.droneBandwidthLine', {
                used: stats.droneBandwidthUsed.toFixed(0),
                total: stats.droneBandwidthTotal.toFixed(0),
              })}
            </li>
            <li>{t('fittings.stats.droneCapacity', { value: stats.droneCapacity.toFixed(0) })}</li>
          </ul>
        ) : (
          placeholder
        )
      )}

      {section(
        'fitting',
        undefined,
        stats ? (
          <ul className="space-y-1 text-xs text-text-dim">
            <li>
              {t('fittings.stats.cpuLine', {
                used: stats.cpuUsed.toFixed(1),
                total: stats.cpuTotal.toFixed(1),
              })}
            </li>
            <li>
              {t('fittings.stats.powergridLine', {
                used: stats.powergridUsed.toFixed(1),
                total: stats.powergridTotal.toFixed(1),
              })}
            </li>
            <li>
              {t('fittings.stats.calibrationLine', {
                used: stats.calibrationUsed.toFixed(0),
                total: stats.calibrationTotal.toFixed(0),
              })}
            </li>
            {stats.unknownItemTypeIds.length > 0 && (
              <li className="text-warning">
                {t('fittings.stats.unknownItems', { count: stats.unknownItemTypeIds.length })}
              </li>
            )}
          </ul>
        ) : (
          placeholder
        )
      )}

      {section(
        'price',
        price
          ? t('fittings.stats.priceSellMeta', { value: price.totals.sell.toFixed(0) })
          : undefined,
        price ? (
          <ul className="space-y-1 text-xs text-text-dim">
            <li>{t('fittings.stats.priceBuy', { value: price.totals.buy.toFixed(0) })}</li>
            <li>{t('fittings.stats.priceSell', { value: price.totals.sell.toFixed(0) })}</li>
            {price.totals.unpricedRows > 0 && (
              <li className="text-warning">
                {t('fittings.stats.priceUnpriced', { count: price.totals.unpricedRows })}
              </li>
            )}
          </ul>
        ) : (
          <p className="text-xs text-text-dim">{t('fittings.stats.priceLoading')}</p>
        )
      )}
    </div>
  );
}

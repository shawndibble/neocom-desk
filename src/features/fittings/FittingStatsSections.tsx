import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Tooltip } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import {
  alignTimeSeconds,
  overheatedOrNull,
  resistPct,
  weaponRowKey,
} from '@/engine/fittings/stats';
import type {
  DamageFigures as DamageFiguresValue,
  FittingStats,
  LocalRepair,
  Resonances,
} from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import type { DogmaAssetProgress } from './dogmaFittingEngine';
import { useDamageProfileName, type DamageProfiles } from './damageProfiles';
import { DamageProfilePicker } from './DamageProfilePicker';
import { AppliedDpsPanel } from './AppliedDpsPanel';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';

const DMG_FILL_CLASS = {
  em: 'bg-dmg-em',
  thermal: 'bg-dmg-thermal',
  kinetic: 'bg-dmg-kinetic',
  explosive: 'bg-dmg-explosive',
} as const;

const DMG_TEXT_CLASS = {
  em: 'text-dmg-em',
  thermal: 'text-dmg-thermal',
  kinetic: 'text-dmg-kinetic',
  explosive: 'text-dmg-explosive',
} as const;

type DamageType = keyof typeof DMG_FILL_CLASS;

const RESIST_TYPES = Object.keys(DMG_FILL_CLASS) as DamageType[];

const RESONANCE_KEY = {
  em: 'emResonance',
  thermal: 'thermalResonance',
  kinetic: 'kineticResonance',
  explosive: 'explosiveResonance',
} as const satisfies Record<DamageType, keyof Resonances>;

const MICRO_LABEL = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

/**
 * An overheated value beside its normal one, in the warning tone — the
 * game marks heat the same way. Renders nothing when `value` is null.
 */
function Overheated({
  value,
  digits,
  unit = '',
}: {
  value: number | null;
  digits: number;
  unit?: string;
}) {
  const { t } = useTranslation();
  if (value === null) return null;
  return (
    <span className="ml-1 text-warning">
      {t('fittings.stats.overheated', { value: `${value.toFixed(digits)}${unit}` })}
    </span>
  );
}

/** Label-over-value pairs, two to a row — the compact body most sections use. */
function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs tabular-nums">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[0.6875rem] text-text-dim">{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One resist, as the game draws it: the damage type's colour filling the share resisted. */
function ResistCell({ resonance, tone }: { resonance: number; tone: DamageType }) {
  const pct = resistPct(resonance);
  return (
    <td className="px-0.5 py-0.5">
      <div className="relative h-5 overflow-hidden rounded-xs bg-panel-2 text-center text-[0.6875rem] leading-5 tabular-nums">
        <div
          className={`absolute inset-y-0 left-0 opacity-45 ${DMG_FILL_CLASS[tone]}`}
          style={{ width: `${pct}%` }}
        />
        <span className="relative">{pct.toFixed(0)}%</span>
      </div>
    </td>
  );
}

interface ResistRow {
  key: string;
  label: string;
  sub?: string;
  resonances: Resonances;
  ehp?: number;
  /** Overheated / adapted rows read as a note on the row above. */
  tone?: 'overheated' | 'note';
}

/**
 * The Defense table (mockup A): a row per layer — its raw HP beneath the
 * name, a cell per damage type, EHP last — with an overheated row under any
 * layer heat changes, and the Reactive Armor Hardener's adapted resists.
 */
function ResistTable({ rows }: { rows: ResistRow[] }) {
  const { t } = useTranslation();
  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th className="w-[26%]" />
          {RESIST_TYPES.map((type) => (
            <th
              key={type}
              scope="col"
              className={`pb-1 text-center text-[0.6875rem] font-semibold uppercase ${DMG_TEXT_CLASS[type]}`}
            >
              {t(`fittings.stats.damageTypeShort.${type}`)}
            </th>
          ))}
          <th scope="col" className={`w-[18%] pb-1 text-right ${MICRO_LABEL}`}>
            {t('fittings.stats.ehpColumn')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th
              scope="row"
              className={`pr-1 text-left align-middle text-xs font-normal ${row.tone ? 'text-warning' : ''}`}
            >
              <span className={row.tone ? '' : 'font-semibold'}>{row.label}</span>
              {row.sub && (
                <span className="block text-[0.6875rem] text-text-dim tabular-nums">{row.sub}</span>
              )}
            </th>
            {RESIST_TYPES.map((type) => (
              <ResistCell key={type} tone={type} resonance={row.resonances[RESONANCE_KEY[type]]} />
            ))}
            <td className="text-right text-xs tabular-nums">
              {row.ehp === undefined ? '' : row.ehp.toFixed(0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DamageFigures({
  dps,
  volley,
  overheated,
}: DamageFiguresValue & { overheated: DamageFiguresValue | null }) {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 text-right tabular-nums">
      <span>{t('fittings.stats.weaponDps', { value: dps.toFixed(1) })}</span>
      <Overheated value={overheatedOrNull(dps, overheated?.dps, 1)} digits={1} />
      <span className="text-text-dim"> · </span>
      <span>{t('fittings.stats.weaponVolley', { value: volley.toFixed(0) })}</span>
      <Overheated value={overheatedOrNull(volley, overheated?.volley, 0)} digits={0} />
    </span>
  );
}

const REPAIR_LAYERS: readonly (keyof LocalRepair)[] = ['shield', 'armor', 'hull'];

const SECTIONS = [
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  'targeting',
  'navigation',
  'drones',
  'fitting',
  'price',
] as const;
type Section = (typeof SECTIONS)[number];

/** Open at first: what a pilot reads on every fit. The rest is a click away, as in the game window. */
const OPEN_BY_DEFAULT: ReadonlySet<Section> = new Set([
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  'navigation',
  'drones',
]);

function StatSection({
  title,
  meta,
  warning,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  meta: string | undefined;
  /** Shown on the row itself, so a warning inside a collapsed section isn't missed. */
  warning?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 pr-3 hover:bg-panel-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            className="flex min-h-11 w-full items-center gap-2 pl-3 text-left text-sm font-semibold md:min-h-9"
          >
            <Caret expanded={expanded} />
            {title}
          </button>
        </h3>
        {warning && <span className="shrink-0 text-xs text-warning">{warning}</span>}
        {meta && <span className="shrink-0 text-sm tabular-nums">{meta}</span>}
      </div>
      {expanded && <div className="space-y-2 px-3 pb-3">{children}</div>}
    </section>
  );
}

/** Lines the "no data" tooltip lists before it sums up the rest — a tooltip is no place for a long list. */
const UNKNOWN_ITEMS_SHOWN = 10;

/**
 * The items with no data in this build, one per line — "Name ×2" where the
 * Fitting has several, so the lines add up to the count beside them.
 */
function unknownItemsList(
  typeIds: readonly number[],
  typeName: (typeId: number) => string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const counts = new Map<number, number>();
  for (const typeId of typeIds) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  const lines = [...counts].map(([typeId, count]) =>
    count > 1
      ? t('fittings.stats.unknownItemCount', { name: typeName(typeId), count })
      : typeName(typeId)
  );
  if (lines.length <= UNKNOWN_ITEMS_SHOWN) return lines.join('\n');
  return [
    ...lines.slice(0, UNKNOWN_ITEMS_SHOWN),
    t('fittings.stats.unknownItemsMore', { count: lines.length - UNKNOWN_ITEMS_SHOWN }),
  ].join('\n');
}

interface FittingStatsSectionsProps {
  stats: FittingStats | null;
  statsProgress: DogmaAssetProgress | null;
  statsError: boolean;
  price: Appraisal | null;
  /** Names an Offense row's weapon, charge or drone. */
  typeName: (typeId: number) => string;
  damageProfiles: DamageProfiles;
  targetProfiles: TargetProfiles;
  /** A saved Fitting to overlay on the applied-DPS graphs; absent without a Character. */
  overlay?: OverlayFitting;
  /** A line above the sections — whose skills the numbers are worked out under. */
  heading?: ReactNode;
  /** The hull takes drones (`showsDrones`) — else there is no Drones section. */
  showDrones?: boolean;
}

/**
 * The stats column (scope decision `20260924-215855`, mockup A): one panel
 * of collapsible sections, each row carrying its headline number, laid out
 * like the game's fitting window. Every section keeps what its ticket put
 * there — per-weapon offense and heat (#1548), damage profiles and the
 * adapted RAH (#1545), target profiles and applied-DPS graphs (#1546).
 */
export function FittingStatsSections({
  stats,
  statsProgress,
  statsError,
  price,
  typeName,
  damageProfiles,
  targetProfiles,
  overlay,
  heading,
  showDrones = true,
}: FittingStatsSectionsProps) {
  const { t } = useTranslation();
  const profileName = useDamageProfileName()(damageProfiles.selected);
  // A RAH's resists move with the profile (the engine adapts it), so the
  // armor row does too — label that, and show the RAH's own adapted resists.
  const adaptedHardeners = (stats?.modules ?? []).flatMap((module) =>
    module.adaptedResonances ? [module.adaptedResonances] : []
  );
  const [expanded, setExpanded] = useState<Record<Section, boolean>>(
    () =>
      Object.fromEntries(
        SECTIONS.map((section) => [section, OPEN_BY_DEFAULT.has(section)])
      ) as Record<Section, boolean>
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

  const overheatedEhp = stats ? overheatedOrNull(stats.ehp, stats.overheated?.ehp, 0) : null;
  const pctOf = (used: number, total: number) => (total > 0 ? (used / total) * 100 : 0);

  function section(id: Section, meta: string | undefined, body: ReactNode, warning?: string) {
    return (
      <StatSection
        key={id}
        title={t(`fittings.stats.section.${id}`)}
        meta={meta}
        warning={warning}
        expanded={expanded[id]}
        onToggle={() => toggle(id)}
      >
        {body}
      </StatSection>
    );
  }

  function resistRows(s: FittingStats): ResistRow[] {
    const layers = [
      {
        key: 'shield',
        label: t('fittings.stats.shield'),
        layer: s.shield,
        hot: s.overheated?.shield,
      },
      { key: 'armor', label: t('fittings.stats.armor'), layer: s.armor, hot: s.overheated?.armor },
      { key: 'hull', label: t('fittings.stats.hull'), layer: s.hull, hot: s.overheated?.hull },
    ];
    const rows: ResistRow[] = [];
    for (const { key, label, layer, hot } of layers) {
      rows.push({
        key,
        label,
        sub: t('fittings.stats.layerHp', { hp: layer.hp.toFixed(0) }),
        resonances: layer,
        ehp: layer.ehp,
      });
      const changed =
        hot !== undefined &&
        RESIST_TYPES.some(
          (type) =>
            overheatedOrNull(
              resistPct(layer[RESONANCE_KEY[type]]),
              resistPct(hot[RESONANCE_KEY[type]]),
              0
            ) !== null
        );
      if (changed && hot) {
        rows.push({
          key: `${key}-hot`,
          label: t('fittings.stats.overheatedRow'),
          resonances: hot,
          tone: 'overheated',
        });
      }
    }
    adaptedHardeners.forEach((resonances, index) =>
      rows.push({
        key: `rah-${index}`,
        label: t('fittings.stats.rahRow'),
        sub: profileName,
        resonances,
        tone: 'note',
      })
    );
    return rows;
  }

  return (
    <div className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      {heading && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-text-dim">
          {heading}
        </div>
      )}

      {section(
        'offense',
        stats && stats.offense.weapons.length > 0
          ? t('fittings.stats.weaponDps', { value: stats.offense.dps.toFixed(1) })
          : undefined,
        stats ? (
          stats.offense.weapons.length > 0 ? (
            <ul className="space-y-1.5 text-xs">
              {stats.offense.weapons.map((row) => (
                <li key={weaponRowKey(row)} className="flex flex-wrap justify-between gap-x-2">
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
        'appliedDps',
        undefined,
        stats ? (
          <AppliedDpsPanel
            applied={stats.applied}
            targetProfiles={targetProfiles}
            overlay={overlay}
          />
        ) : (
          placeholder
        )
      )}

      {section(
        'defense',
        stats ? t('fittings.stats.defenseEhp', { value: stats.ehp.toFixed(0) }) : undefined,
        <>
          <DamageProfilePicker damageProfiles={damageProfiles} />
          {stats ? (
            <>
              <ResistTable rows={resistRows(stats)} />
              {adaptedHardeners.length > 0 && (
                <p className="text-xs text-text-dim">
                  {t('fittings.stats.armorIncludesRah', { profile: profileName })}
                </p>
              )}
              <ul className="space-y-1 text-xs text-text-dim">
                {overheatedEhp !== null && (
                  <li>
                    {t('fittings.stats.ehpLine', { value: stats.ehp.toFixed(0) })}
                    <Overheated value={overheatedEhp} digits={0} />
                  </li>
                )}
                {REPAIR_LAYERS.filter((layer) => stats.repair[layer] > 0).map((layer) => (
                  <li key={layer}>
                    {t(`fittings.stats.repair.${layer}`, {
                      value: stats.repair[layer].toFixed(1),
                    })}
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
            </>
          ) : (
            placeholder
          )}
        </>
      )}

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
          <Facts
            items={[
              {
                label: t('fittings.stats.fact.capacity'),
                value: t('fittings.stats.unit.gj', { value: stats.capacitorCapacity.toFixed(0) }),
              },
              {
                label: t('fittings.stats.fact.recharge'),
                value: t('fittings.stats.unit.seconds', {
                  value: (stats.capacitorRechargeTime / 1000).toFixed(0),
                }),
              },
            ]}
          />
        ) : (
          placeholder
        )
      )}

      {section(
        'targeting',
        stats
          ? t('fittings.stats.unit.km', {
              value: (stats.targeting.maxTargetRange / 1000).toFixed(1),
            })
          : undefined,
        stats ? (
          <Facts
            items={[
              {
                label: t('fittings.stats.fact.targetRange'),
                value: t('fittings.stats.unit.km', {
                  value: (stats.targeting.maxTargetRange / 1000).toFixed(1),
                }),
              },
              {
                label: t('fittings.stats.fact.lockedTargets'),
                value: String(stats.targeting.maxLockedTargets),
              },
              {
                label: t('fittings.stats.fact.scanResolution'),
                value: t('fittings.stats.unit.mm', {
                  value: stats.targeting.scanResolution.toFixed(0),
                }),
              },
              {
                label: t('fittings.stats.fact.signature'),
                value: t('fittings.stats.unit.metres', {
                  value: stats.targeting.signatureRadius.toFixed(0),
                }),
              },
            ]}
          />
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
          <Facts
            items={[
              {
                label: t('fittings.stats.fact.maxVelocity'),
                value: (
                  <>
                    {t('fittings.stats.maxVelocityMeta', {
                      value: stats.navigation.maxVelocity.toFixed(0),
                    })}
                    <Overheated
                      value={overheatedOrNull(
                        stats.navigation.maxVelocity,
                        stats.overheated?.maxVelocity,
                        0
                      )}
                      digits={0}
                    />
                  </>
                ),
              },
              {
                label: t('fittings.stats.fact.align'),
                value: t('fittings.stats.unit.seconds', {
                  value: alignTimeSeconds(stats.navigation.mass, stats.navigation.agility).toFixed(
                    1
                  ),
                }),
              },
              {
                label: t('fittings.stats.fact.agility'),
                value: stats.navigation.agility.toFixed(3),
              },
              {
                label: t('fittings.stats.fact.mass'),
                value: t('fittings.stats.unit.tonnes', {
                  value: (stats.navigation.mass / 1000).toFixed(0),
                }),
              },
              {
                label: t('fittings.stats.fact.warpSpeed'),
                value: t('fittings.stats.unit.auPerSecond', {
                  value: stats.navigation.warpSpeed.toFixed(1),
                }),
              },
            ]}
          />
        ) : (
          placeholder
        )
      )}

      {showDrones &&
        section(
          'drones',
          stats ? t('fittings.stats.weaponDps', { value: stats.droneDps.toFixed(1) }) : undefined,
          stats ? (
            <Facts
              items={[
                {
                  label: t('fittings.stats.fact.droneDps'),
                  value: stats.droneDps.toFixed(1),
                },
                {
                  label: t('fittings.stats.fact.bandwidth'),
                  value: t('fittings.stats.unit.bandwidth', {
                    used: stats.droneBandwidthUsed.toFixed(0),
                    total: stats.droneBandwidthTotal.toFixed(0),
                  }),
                },
                {
                  label: t('fittings.stats.fact.droneBay'),
                  value: t('fittings.stats.unit.cubicMetres', {
                    value: stats.droneCapacity.toFixed(0),
                  }),
                },
              ]}
            />
          ) : (
            placeholder
          )
        )}

      {section(
        'fitting',
        stats
          ? t('fittings.stats.fittingMeta', {
              cpu: pctOf(stats.cpuUsed, stats.cpuTotal).toFixed(0),
              pg: pctOf(stats.powergridUsed, stats.powergridTotal).toFixed(0),
            })
          : undefined,
        stats ? (
          <>
            <Facts
              items={[
                {
                  label: t('fittings.stats.fact.cpu'),
                  value: t('fittings.stats.unit.usedOfTotal', {
                    used: stats.cpuUsed.toFixed(1),
                    total: stats.cpuTotal.toFixed(1),
                  }),
                },
                {
                  label: t('fittings.stats.fact.powergrid'),
                  value: t('fittings.stats.unit.usedOfTotal', {
                    used: stats.powergridUsed.toFixed(1),
                    total: stats.powergridTotal.toFixed(1),
                  }),
                },
                {
                  label: t('fittings.stats.fact.calibration'),
                  value: t('fittings.stats.unit.usedOfTotal', {
                    used: stats.calibrationUsed.toFixed(0),
                    total: stats.calibrationTotal.toFixed(0),
                  }),
                },
              ]}
            />
            {stats.unknownItemTypeIds.length > 0 && (
              <p className="text-xs text-warning">
                {/* Which items, one per line — on hover, focus or a tap. */}
                <Tooltip
                  openOnTap
                  content={unknownItemsList(stats.unknownItemTypeIds, typeName, t)}
                >
                  <button
                    type="button"
                    className="cursor-help underline decoration-dotted underline-offset-2"
                  >
                    {t('fittings.stats.unknownItems', { count: stats.unknownItemTypeIds.length })}
                  </button>
                </Tooltip>
              </p>
            )}
          </>
        ) : (
          placeholder
        ),
        stats && stats.unknownItemTypeIds.length > 0 ? t('fittings.stats.incomplete') : undefined
      )}

      {section(
        'price',
        price
          ? t('fittings.stats.unit.isk', { value: formatIskCompact(price.totals.sell) })
          : undefined,
        price ? (
          <>
            <Facts
              items={[
                {
                  label: t('fittings.stats.fact.sell'),
                  value: t('fittings.stats.unit.isk', {
                    value: formatIskCompact(price.totals.sell),
                  }),
                },
                {
                  label: t('fittings.stats.fact.buy'),
                  value: t('fittings.stats.unit.isk', {
                    value: formatIskCompact(price.totals.buy),
                  }),
                },
              ]}
            />
            {price.totals.unpricedRows > 0 && (
              <p className="text-xs text-warning">
                {t('fittings.stats.priceUnpriced', { count: price.totals.unpricedRows })}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-text-dim">{t('fittings.stats.priceLoading')}</p>
        ),
        price && price.totals.unpricedRows > 0 ? t('fittings.stats.incomplete') : undefined
      )}
    </div>
  );
}

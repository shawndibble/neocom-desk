import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Caret, RowMoreActions, Tooltip } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import {
  alignTimeSeconds,
  overheatedOrNull,
  resistPct,
  weaponRowKey,
} from '@/engine/fittings/stats';
import type {
  DamageFigures as DamageFiguresValue,
  Fitting,
  FittingItemState,
  FittingModule,
  FittingModuleResult,
  FittingStats,
  Resonances,
  StatsErrorReason,
  WeaponRow,
} from '@/engine/fittings/types';
import type { Appraisal } from '@/engine/market/appraisal';
import type { DogmaAssetProgress } from './dogmaFittingEngine';
import { useDamageProfileName, type DamageProfiles } from './damageProfiles';
import { DamageProfilePicker } from './DamageProfilePicker';
import { AppliedDpsPanel } from './AppliedDpsPanel';
import { Facts, Overheated, type Fact } from './StatFacts';
import { StatsToolbar } from './StatsToolbar';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  isSectionExpanded,
  useStatsSectionsPreference,
  withSectionExpanded,
} from './statsSectionsPreference';
import { CapacitorFacts, TankFacts } from './FittingTankStats';
import { SupportFacts } from './FittingSupportStats';
import { MiningFacts } from './FittingMiningStats';
import { ProjectedEffectsPanel } from './ProjectedEffectsPanel';
import { useProjectedSources } from './statsConditions';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';
import { FittingItemMenu, WeaponMenuItems } from './FittingItemMenu';
import { useFittingItemActions } from './fittingItemActions';

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

export interface ResistRow {
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
export function ResistTable({ rows }: { rows: ResistRow[] }) {
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

/** Stable ids — the remembered layout (`statsSectionsPreference.ts`) is keyed on them. */
type Section =
  | 'offense'
  | 'appliedDps'
  | 'defense'
  | 'capacitor'
  | 'support'
  | 'mining'
  | 'projected'
  | 'targeting'
  | 'navigation'
  | 'drones'
  | 'fighters'
  | 'fitting'
  | 'price';

/** Open at first: what a pilot reads on every fit. The rest is a click away, as in the game window. */
const OPEN_BY_DEFAULT: ReadonlySet<Section> = new Set([
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  // Only there at all when the fit has something to show in it.
  'support',
  'mining',
  'navigation',
  'drones',
  'fighters',
]);

function StatSection({
  title,
  meta,
  warning,
  hot = false,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  meta: string | undefined;
  /** Every figure is the overheated one ("Overheat all"): read in the warning tone, as the game marks heat. */
  hot?: boolean;
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
        {meta && (
          <span className={`shrink-0 text-sm tabular-nums ${hot ? 'text-warning' : ''}`}>
            {meta}
          </span>
        )}
      </div>
      {expanded && (
        <div className={`space-y-2 px-3 pb-3 ${hot ? 'text-warning' : ''}`}>{children}</div>
      )}
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
  /** What failed, when `statsError`: the pilot's skills, or the ship data / calculation. */
  statsErrorReason?: StatsErrorReason;
  /** Tries the failed load again; without it the error has no retry. */
  onRetry?: () => void;
  price: Appraisal | null;
  /** Names an Offense row's weapon, charge or drone. */
  typeName: (typeId: number) => string;
  damageProfiles: DamageProfiles;
  targetProfiles: TargetProfiles;
  /** A saved Fitting to overlay on the applied-DPS graphs; absent without a Character. */
  overlay?: OverlayFitting;
  /** A line above the sections — whose skills the numbers are worked out under. */
  heading?: ReactNode;
  /** Controls for the conditions every section is worked out in (the Abyssal weather), under the heading. */
  conditions?: ReactNode;
  /** The hull takes drones (`showsDrones`) — else there is no Drones section. */
  showDrones?: boolean;
  /**
   * The open Fitting, and its modules' results when they line up with it:
   * with the editor's item actions, each Offense weapon row gets the item
   * menu for its group (change charge, state, show info).
   */
  fitting?: Fitting | null;
  moduleResults?: FittingModuleResult[] | null;
}

const FIRING: readonly FittingItemState[] = ['active', 'overload'];
const STATE_ORDER: readonly FittingItemState[] = ['offline', 'online', 'active', 'overload'];

/**
 * The fitted modules an Offense row stands for — its type, holding its
 * charge, firing — with the state they share and the highest all can reach.
 */
function weaponGroup(
  row: WeaponRow,
  fitting: Fitting,
  moduleResults: FittingModuleResult[] | null
): { modules: FittingModule[]; shownState?: FittingItemState; maxState?: FittingItemState } {
  const members = fitting.modules.flatMap((module, index) => {
    const result = moduleResults?.[index];
    const state = result?.state ?? module.state;
    return module.typeId === row.typeId &&
      module.chargeTypeId === row.chargeTypeId &&
      FIRING.includes(state)
      ? [{ module, state, maxState: result?.maxState }]
      : [];
  });
  const states = new Set(members.map((member) => member.state));
  const maxStates = members.map((member) => member.maxState);
  const maxState = maxStates.every((state) => state !== undefined)
    ? maxStates.reduce<FittingItemState | undefined>(
        (lowest, state) =>
          lowest === undefined || STATE_ORDER.indexOf(state!) < STATE_ORDER.indexOf(lowest)
            ? state
            : lowest,
        undefined
      )
    : undefined;
  return {
    modules: members.map((member) => member.module),
    ...(states.size === 1 ? { shownState: [...states][0] } : {}),
    ...(maxState === undefined ? {} : { maxState }),
  };
}

/** The Offense section's rows — a weapon group, drone stack or squadron each — and their total. */
function OffenseRows({
  stats,
  typeName,
  fitting,
  moduleResults,
}: {
  stats: FittingStats;
  typeName: (typeId: number) => string;
  fitting: Fitting | null;
  moduleResults: FittingModuleResult[] | null;
}) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  return (
    <ul className="space-y-1.5 text-xs">
      {stats.offense.weapons.map((row) => {
        const group =
          actions !== null && fitting !== null && !row.isDrone
            ? weaponGroup(row, fitting, moduleResults)
            : null;
        const name = t('fittings.stats.weaponRow', {
          count: row.count,
          name: typeName(row.typeId),
        });
        const hasMenu = group !== null && group.modules.length > 0;
        const content = (
          <>
            <span className="min-w-0 flex-1">
              <span>{name}</span>
              {row.chargeTypeId !== undefined && (
                <span className="block text-text-dim">{typeName(row.chargeTypeId)}</span>
              )}
              {row.isDrone && (
                <span className="block text-text-dim">
                  {t(
                    row.isFighter
                      ? 'fittings.stats.fightersNoOverheat'
                      : 'fittings.stats.dronesNoOverheat'
                  )}
                </span>
              )}
            </span>
            <DamageFigures {...row} />
            {hasMenu && <RowMoreActions />}
          </>
        );
        const rowClass = 'flex flex-wrap items-center justify-between gap-x-2';
        return hasMenu ? (
          <FittingItemMenu
            key={weaponRowKey(row)}
            name={name}
            items={
              <WeaponMenuItems
                modules={group.modules}
                shownState={group.shownState}
                maxState={group.maxState}
              />
            }
          >
            <li className={rowClass}>{content}</li>
          </FittingItemMenu>
        ) : (
          <li key={weaponRowKey(row)} className={rowClass}>
            {content}
          </li>
        );
      })}
      <li className="flex justify-between gap-x-2 border-t border-line pt-1 font-semibold">
        <span>{t('fittings.stats.offenseTotal')}</span>
        <DamageFigures {...stats.offense} />
      </li>
    </ul>
  );
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
  statsErrorReason = 'shipData',
  onRetry,
  price,
  typeName,
  damageProfiles,
  targetProfiles,
  overlay,
  heading,
  conditions,
  showDrones = true,
  fitting = null,
  moduleResults = null,
}: FittingStatsSectionsProps) {
  const { t } = useTranslation();
  const profileName = useDamageProfileName()(damageProfiles.selected);
  // A fit with nothing priceable totals 0 on both sides — that's "unknown",
  // not a free ship, so the price section shows a dash instead of "0 ISK".
  const nothingPriced = price !== null && price.totals.sell === 0 && price.totals.buy === 0;
  const iskLabel = (value: number) =>
    t('fittings.stats.unit.isk', { value: formatIskCompact(value) });
  // A RAH's resists move with the profile (the engine adapts it), so the
  // armor row does too — label that, and show the RAH's own adapted resists.
  const adaptedHardeners = (stats?.modules ?? []).flatMap((module) =>
    module.adaptedResonances ? [module.adaptedResonances] : []
  );
  // Which sections are open is the pilot's own layout, kept on this device
  // (`statsSectionsPreference.ts`); an untouched one opens as OPEN_BY_DEFAULT
  // says on desktop and starts collapsed on a phone.
  const isPhone = useIsPhone();
  const storedSections = useStatsSectionsPreference((state) => state.value);
  const hydrateSections = useStatsSectionsPreference((state) => state.hydrate);
  const setSections = useStatsSectionsPreference((state) => state.setValue);
  useEffect(() => {
    void hydrateSections();
  }, [hydrateSections]);
  const isExpanded = (section: Section) =>
    isSectionExpanded(storedSections, section, {
      isPhone,
      openByDefault: OPEN_BY_DEFAULT.has(section),
    });
  const projectedShips = useProjectedSources((state) =>
    state.sources.reduce((sum, source) => sum + source.count, 0)
  );
  const toggle = (section: Section) =>
    // From the store's current value, never this render's possibly stale copy.
    void setSections(
      withSectionExpanded(
        useStatsSectionsPreference.getState().value,
        section,
        !isExpanded(section)
      )
    );

  const downloadPct =
    statsProgress?.totalBytes && statsProgress.totalBytes > 0
      ? Math.round((statsProgress.loadedBytes / statsProgress.totalBytes) * 100)
      : null;

  // The error is said once, above the sections; each section just says it has nothing.
  const placeholder = statsError ? (
    <p className="text-xs text-text-dim">{t('fittings.stats.unavailable')}</p>
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
        hot={stats?.allOverheated ?? false}
        expanded={isExpanded(id)}
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

  /** Support out's headline: remote repair handed out, else how many modules reach another ship. */
  function supportMeta(s: FittingStats): string {
    const { remoteRepair, rows } = s.support;
    const repair = remoteRepair.shield + remoteRepair.armor + remoteRepair.hull;
    if (repair > 0) return t('fittings.stats.unit.hpPerSecond', { value: repair.toFixed(1) });
    return t('fittings.stats.support.modules', {
      count: rows.reduce((sum, row) => sum + row.count, 0),
    });
  }

  /** Holds, jump drive and sensors: what the hull carries, beside what the fit asks of it. */
  function resourceFacts(s: FittingStats): Fact[] {
    const facts: Fact[] = [
      {
        label: t('fittings.stats.fact.cargo'),
        value: t('fittings.stats.unit.cubicMetres', { value: s.holds.cargo.toFixed(0) }),
      },
    ];
    if (s.holds.fleetHangar > 0)
      facts.push({
        label: t('fittings.stats.fact.fleetHangar'),
        value: t('fittings.stats.unit.cubicMetres', { value: s.holds.fleetHangar.toFixed(0) }),
      });
    if (s.holds.miningHold > 0)
      facts.push({
        label: t('fittings.stats.fact.miningHold'),
        value: t('fittings.stats.unit.cubicMetres', { value: s.holds.miningHold.toFixed(0) }),
      });
    if (s.sensor.type !== null)
      facts.push({
        label: t('fittings.stats.fact.sensorStrength'),
        value: t('fittings.stats.unit.sensor', {
          value: s.sensor.strength.toFixed(1),
          type: t(`fittings.stats.sensorType.${s.sensor.type}`),
        }),
      });
    if (s.jumpDrive)
      facts.push(
        {
          label: t('fittings.stats.fact.jumpRange'),
          value: t('fittings.stats.unit.lightYears', {
            value: s.jumpDrive.rangeLightYears.toFixed(2),
          }),
        },
        {
          label: t('fittings.stats.fact.jumpFuel'),
          value: t('fittings.stats.unit.fuelPerLightYear', {
            value: s.jumpDrive.fuelPerLightYear.toFixed(0),
            fuel: typeName(s.jumpDrive.fuelTypeId),
          }),
        }
      );
    return facts;
  }

  return (
    <div className="rounded-xs border border-line bg-panel/85 backdrop-blur-sm">
      {heading && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-text-dim">
          {heading}
        </div>
      )}
      {conditions && <div className="border-b border-line px-3 py-2">{conditions}</div>}
      {stats && <StatsToolbar stats={stats} />}
      {statsError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-danger"
        >
          <span>
            {t(
              statsErrorReason === 'skills' ? 'fittings.stats.errorSkills' : 'fittings.stats.error'
            )}
          </span>
          {onRetry && (
            <Button size="sm" onClick={onRetry}>
              {t('fittings.stats.retry')}
            </Button>
          )}
        </div>
      )}

      {section(
        'offense',
        stats && stats.offense.weapons.length > 0
          ? t('fittings.stats.weaponDps', { value: stats.offense.dps.toFixed(1) })
          : undefined,
        stats ? (
          stats.offense.weapons.length > 0 ? (
            <OffenseRows
              stats={stats}
              typeName={typeName}
              fitting={fitting}
              moduleResults={moduleResults}
            />
          ) : stats.offense.chargelessWeaponCount > 0 ? (
            <p className="text-xs text-text-dim">
              {t('fittings.stats.offenseNoCharge', { count: stats.offense.chargelessWeaponCount })}
            </p>
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
            chargelessWeaponCount={stats.offense.chargelessWeaponCount}
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
              {overheatedEhp !== null && (
                <p className="text-xs text-text-dim">
                  {t('fittings.stats.ehpLine', { value: stats.ehp.toFixed(0) })}
                  <Overheated value={overheatedEhp} digits={0} />
                </p>
              )}
              <TankFacts stats={stats} typeName={typeName} />
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
        stats ? <CapacitorFacts stats={stats} /> : placeholder
      )}

      {stats &&
        stats.support.rows.length > 0 &&
        section(
          'support',
          supportMeta(stats),
          <SupportFacts support={stats.support} typeName={typeName} />
        )}

      {stats &&
        stats.mining.rows.length > 0 &&
        section(
          'mining',
          t('fittings.stats.unit.cubicMetresPerSecond', {
            value: stats.mining.perSecond.toFixed(1),
          }),
          <MiningFacts stats={stats} typeName={typeName} />
        )}

      {section(
        'projected',
        projectedShips > 0 ? t('fittings.projected.meta', { count: projectedShips }) : undefined,
        <ProjectedEffectsPanel />
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
                value:
                  stats.lockedTargets.ship === stats.lockedTargets.pilot
                    ? String(stats.targeting.maxLockedTargets)
                    : t('fittings.stats.lockedTargetsValue', { ...stats.lockedTargets }),
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
                {
                  label: t('fittings.stats.fact.maxActiveDrones'),
                  value: String(stats.maxActiveDrones),
                },
              ]}
            />
          ) : (
            placeholder
          )
        )}

      {stats &&
        stats.fighters.tubes.total > 0 &&
        section(
          'fighters',
          t('fittings.stats.weaponDps', { value: stats.fighters.dps.toFixed(1) }),
          <Facts
            items={[
              {
                label: t('fittings.stats.fact.fighterDps'),
                value: stats.fighters.dps.toFixed(1),
              },
              {
                label: t('fittings.stats.fact.fighterTubes'),
                value: t('fittings.stats.unit.usedOfTotal', {
                  used: stats.fighters.tubes.used.toFixed(0),
                  total: stats.fighters.tubes.total.toFixed(0),
                }),
              },
              {
                label: t('fittings.stats.fact.fighterBay'),
                value: t('fittings.stats.unit.cubicMetresUsed', {
                  used: stats.fighters.bay.used.toFixed(0),
                  total: stats.fighters.bay.total.toFixed(0),
                }),
              },
            ]}
          />
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
                ...resourceFacts(stats),
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
        price ? (nothingPriced ? '—' : iskLabel(price.totals.sell)) : undefined,
        price ? (
          <>
            <Facts
              items={[
                {
                  label: t('fittings.stats.fact.sell'),
                  value: nothingPriced ? '—' : iskLabel(price.totals.sell),
                },
                {
                  label: t('fittings.stats.fact.buy'),
                  value: nothingPriced ? '—' : iskLabel(price.totals.buy),
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

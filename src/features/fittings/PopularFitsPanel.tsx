import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  InfoTooltip,
  IskAmount,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import type { FitSellPrice } from '@/engine/fittings/fitSellPrice';
import type { FitSkillVerdict, MissingSkill } from '@/engine/fittings/fitSkillVerdict';
import type { LoadedFitting } from '@/engine/fittings/load';
import { popularFitLoad, type PopularFit } from '@/engine/fittings/popularFits';
import { fittingRequirementTypeIds } from '@/engine/fittings/skillGaps';
import { formatAge } from '@/lib/age';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useTouchContext } from '@/lib/useMediaQuery';
import { useNow } from '@/lib/useNow';
import { zkillFailureKey } from '@/lib/zkillFailureKey';
import { typeName } from '@/sde/loadSde';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { MissingSkillsList } from './MissingSkillsList';
import { useMissingSkillRows } from './useMissingSkillRows';
import {
  closestFit,
  listFits,
  sourceCounts,
  type FitSort,
  type FitSourceFilter,
  type ListedFit,
} from './popularFitList';
import { usePopularFits } from './popularFits';
import { PopularFitRow } from './PopularFitRow';
import { FitVerdictControl } from './PopularFitVerdict';
import { useFitTrainingSeconds } from './useFitTrainingSeconds';
import {
  fitVerdictSources,
  usePopularFitVerdicts,
  type FitVerdictSources,
  type VerdictFit,
} from './usePopularFitVerdicts';
import { useModuleNames } from './useModuleNames';
import { VirtualFitList } from './VirtualFitList';
import {
  useWorkbenchHullRows,
  workbenchHullSources,
  type WorkbenchHullSources,
  type WorkbenchRow,
} from './workbenchHullRows';
import { OutOfDateNote } from './WorkbenchOutOfDate';
import { WorkbenchSightingBadge } from './WorkbenchSightingBadge';

/** What the panel reads from outside: the Workbench rows' sources, module names, and can-fly verdicts. */
export interface PopularFitsSources extends WorkbenchHullSources, FitVerdictSources {
  typeName: (typeId: number) => Promise<string>;
}

const POPULAR_FITS_SOURCES: PopularFitsSources = {
  ...workbenchHullSources,
  ...fitVerdictSources,
  // Read when called, not now: a test mocking `@/sde/loadSde` may leave it out.
  typeName: (typeId) => typeName(typeId),
};

interface PopularFitsPanelProps {
  shipTypeId: number;
  hullName: string;
  onOpen: (loaded: LoadedFitting) => void;
  /** An open already under way: Open waits for it. */
  busy?: boolean;
  /**
   * Cap the list's height and scroll it in place — for a host with other
   * content below it. Off, the list runs its full length and the host scrolls.
   */
  capped?: boolean;
  /** For tests: stand-ins for Firestore, the SDE, prices, zKillboard and Load. Pass it stable. */
  sources?: PopularFitsSources;
}

/** One row of the merged list: a group of zKillboard losses or an EVE Workbench guide. */
type PanelRow = ListedFit &
  (
    | { source: 'loss'; fit: PopularFit; /** Its place among the losses, by count. */ rank: number }
    | { source: 'guide'; guide: WorkbenchRow }
  );

const SORTS: readonly FitSort[] = ['newest', 'seen', 'training', 'cheapest'];

/**
 * A row's height before it is measured: title line and one line of module
 * icons, plus the gap below it.
 */
const ROW_ESTIMATE = 104;

const rowKey = (row: PanelRow) => row.key;

/** The types a row's verdict says the pilot can't use; none without a gap. */
const unusableOf = (verdict: FitSkillVerdict | undefined) =>
  verdict?.kind === 'missing' ? verdict.unusableTypeIds : undefined;

/**
 * Popular fits (issues #2327, #2484): one list of the hull's recent zKillboard
 * losses, grouped into distinct fits, and the community fits published on EVE
 * Workbench (our own synced copy in R2, `workbenchFits.ts`). A source filter,
 * "Can fly now" (#6011's verdicts) and a sort narrow and order it; a fit the
 * active Character can't fly yet opens to the skills it needs. Any row opens
 * the fit in the editor; a source that fails is a one-line note — the other
 * source and the rest of the page work without it.
 */
export function PopularFitsPanel({
  shipTypeId,
  hullName,
  onOpen,
  busy = false,
  capped = true,
  sources = POPULAR_FITS_SOURCES,
}: PopularFitsPanelProps) {
  const { t } = useTranslation();
  const now = useNow();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const losses = usePopularFits(shipTypeId, sources.popularFits);
  const guides = useWorkbenchHullRows(shipTypeId, sources);
  const [filter, setFilter] = useState<FitSourceFilter>('all');
  const [flyOnly, setFlyOnly] = useState(false);
  const [sort, setSort] = useState<FitSort>('newest');
  const [expanded, setExpanded] = useState<string | null>(null);

  const lossFits = losses?.ok ? losses.fits : null;
  const guideRows = guides.status === 'ready' ? guides.rows : null;
  const rows = useMemo(
    (): PanelRow[] => [
      ...(lossFits ?? []).map((fit, index): PanelRow => ({
        key: `loss:${fit.key}`,
        source: 'loss',
        fit,
        rank: index + 1,
        newest: fit.lastSeen === null ? null : Date.parse(fit.lastSeen),
        seen: fit.count,
        isk: fit.value,
      })),
      ...(guideRows ?? []).map((row): PanelRow => ({
        key: `guide:${row.fit.id}`,
        source: 'guide',
        guide: row,
        newest: row.fit.dateAdded,
        seen: row.sighting?.count ?? 0,
        isk: row.price?.sell ?? null,
      })),
    ],
    [lossFits, guideRows]
  );

  const typeIds = useMemo(() => {
    if (lossFits === null && guides.moduleTypeIds === null) return null;
    return [
      ...(lossFits ?? []).flatMap((fit) => fit.parts.modules.map((m) => m.typeId)),
      ...(guides.moduleTypeIds ?? []),
    ];
  }, [lossFits, guides.moduleTypeIds]);
  const names = useModuleNames(typeIds, sources.typeName);
  const verdictFits = useMemo(
    () =>
      rows.length === 0
        ? null
        : rows.map((row): VerdictFit => ({
            key: row.key,
            typeIds:
              row.source === 'loss'
                ? fittingRequirementTypeIds({
                    shipTypeId: row.fit.parts.hullTypeId,
                    ...row.fit.parts,
                  })
                : row.guide.requirementTypeIds,
          })),
    [rows]
  );
  const verdicts = usePopularFitVerdicts(verdictFits, sources);
  const seconds = useFitTrainingSeconds(verdicts);

  const touch = useTouchContext();
  // Without verdicts there is nothing to filter on: a Character switched away leaves it off.
  const flyFilter = flyOnly && verdicts !== null;
  const lookup = useMemo(
    () => ({
      canFly: (key: string) => {
        const kind = verdicts?.get(key)?.kind;
        return kind === undefined ? undefined : kind === 'canFly';
      },
      seconds: (key: string) => seconds.get(key),
    }),
    [verdicts, seconds]
  );
  const { counts, inScope, shown, flyable } = useMemo(() => {
    const inScope = listFits(rows, { source: filter, flyOnly: false, sort }, lookup);
    const flyableRows = inScope.filter((row) => lookup.canFly(row.key) === true);
    return {
      counts: sourceCounts(rows),
      inScope,
      shown: flyFilter ? flyableRows : inScope,
      flyable: flyableRows.length,
    };
  }, [rows, filter, sort, flyFilter, lookup]);
  const closest = flyFilter && shown.length === 0 ? closestFit(inScope, lookup.seconds) : undefined;

  const titleOf = (row: PanelRow) =>
    row.source === 'loss'
      ? t('fittings.popular.losses', { count: row.fit.count })
      : row.guide.fit.name || t('fittings.popular.workbench.unnamed');

  function renderRow(row: PanelRow) {
    const verdict = verdicts?.get(row.key);
    const open = expanded === row.key && verdict?.kind === 'missing';
    const shared: SharedRowProps = {
      source: row.source,
      title: titleOf(row),
      names,
      unusable: unusableOf(verdict),
      verdict: (
        <FitVerdictControl
          verdict={verdict}
          seconds={seconds.get(row.key)}
          expanded={open}
          onToggle={() => setExpanded(open ? null : row.key)}
        />
      ),
      details:
        open && characterId !== null ? (
          <InlineMissingSkills
            entries={verdict.skills}
            characterId={characterId}
            fittingName={titleOf(row)}
          />
        ) : undefined,
    };
    return row.source === 'loss' ? (
      <LossFitRow
        shared={shared}
        fit={row.fit}
        now={now}
        disabled={busy}
        onOpen={() =>
          onOpen(
            popularFitLoad(row.fit, t('fittings.popular.fitName', { hullName, rank: row.rank }))
          )
        }
      />
    ) : (
      <GuideFitRow
        shared={shared}
        guide={row.guide}
        now={now}
        hub={guides.hub.systemName}
        disabled={busy || guides.loading}
        onOpen={() => void guides.load(row.guide.fit, onOpen)}
      />
    );
  }

  const lossStatus: ReactNode =
    losses === null ? (
      <Spinner size="sm" delayMs={200} label={t('fittings.popular.loading')} />
    ) : !losses.ok ? (
      <p role="status" className="text-xs text-warning">
        {t(zkillFailureKey(losses.reason, 'fittings.popular.failed'))}
      </p>
    ) : losses.fits.length === 0 && (filter === 'loss' || rows.length === 0) ? (
      <p className="text-xs text-text-dim">{t('fittings.popular.empty')}</p>
    ) : null;
  const guideStatus: ReactNode =
    guides.status === 'loading' ? (
      <Spinner size="sm" delayMs={200} label={t('fittings.popular.workbench.loading')} />
    ) : guides.status === 'failed' ? (
      <p role="status" className="text-xs text-warning">
        {t('fittings.popular.workbench.failed')}
      </p>
    ) : guides.status === 'empty' && (filter === 'guide' || rows.length === 0) ? (
      <p className="text-xs text-text-dim">{t('fittings.popular.workbench.empty')}</p>
    ) : null;

  return (
    <section aria-label={t('fittings.popular.title')} className="space-y-2">
      <div className="flex items-center gap-1.5">
        <h3 className={eyebrowClassName}>{t('fittings.popular.heading')}</h3>
        <InfoTooltip
          glyph="info"
          label={t('fittings.popular.sourcesLabel')}
          content={t('fittings.popular.sources')}
        />
      </div>
      <p className="text-xs text-text-dim">{t('fittings.popular.caption', { context: touch })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<FitSourceFilter>
          size="sm"
          label={t('fittings.popular.sourceLabel')}
          options={(['all', 'loss', 'guide'] as const).map((value) => ({
            value,
            label: t(`fittings.popular.filter.${value}`, { n: counts[value] }),
          }))}
          value={filter}
          onChange={setFilter}
        />
        {verdicts !== null && (
          <label
            className={cx(
              tappableRowClassName,
              'flex cursor-pointer items-center gap-2 text-xs text-text'
            )}
          >
            <Checkbox checked={flyOnly} onChange={() => setFlyOnly(!flyOnly)} />
            {t('fittings.popular.canFlyNow')}
            <span className="text-text-dim tabular-nums">
              {t('fittings.popular.canFlyCount', { flyable, total: inScope.length })}
            </span>
          </label>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-text-dim">
          <span aria-hidden="true">{t('fittings.popular.sortLabel')}</span>
          <Select value={sort} onValueChange={(value) => setSort(value as FitSort)}>
            <SelectTrigger aria-label={t('fittings.popular.sortLabel')} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`fittings.popular.sort.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {filter !== 'guide' && lossStatus}
      {filter !== 'loss' && guideStatus}
      {flyFilter && shown.length === 0 && inScope.length > 0 && (
        <div className="space-y-2 border border-dashed border-line-bright p-3 text-sm">
          <p>{t('fittings.popular.noneFlyable', { count: inScope.length })}</p>
          {closest && (
            <p className="text-xs text-text-dim">
              {t('fittings.popular.closest', {
                name:
                  closest.source === 'loss'
                    ? t('fittings.popular.closestLoss', { count: closest.fit.count })
                    : titleOf(closest),
                time: formatCountdown(seconds.get(closest.key) ?? 0),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setFlyOnly(false)}>
              {t('fittings.popular.showAll')}
            </Button>
            {closest && (
              <Button
                size="sm"
                onClick={() => {
                  setFlyOnly(false);
                  setSort('training');
                  setExpanded(closest.key);
                }}
              >
                {t('fittings.popular.showClosest')}
              </Button>
            )}
          </div>
        </div>
      )}
      {shown.length > 0 && (
        <VirtualFitList
          items={shown}
          itemKey={rowKey}
          estimateSize={ROW_ESTIMATE}
          label={t('fittings.popular.listLabel')}
          capped={capped}
          renderItem={renderRow}
        />
      )}
      {filter !== 'loss' && guides.status === 'ready' && <OutOfDateNote list={guides} />}
    </section>
  );
}

/** What a row takes from the panel whichever source it is: tag, title, names, verdict and its skills. */
type SharedRowProps = Pick<
  ComponentProps<typeof PopularFitRow>,
  'source' | 'title' | 'names' | 'unusable' | 'verdict' | 'details'
>;

interface SourceRowProps {
  shared: SharedRowProps;
  now: number;
  disabled: boolean;
  onOpen: () => void;
}

/** A group of zKillboard losses: when it was last seen, and its mean value. */
function LossFitRow({ shared, fit, now, disabled, onOpen }: SourceRowProps & { fit: PopularFit }) {
  const { t } = useTranslation();
  return (
    <PopularFitRow
      {...shared}
      meta={
        fit.lastSeen === null
          ? undefined
          : ` · ${t('fittings.popular.lastSeen', {
              age: formatAge(Math.max(0, now - Date.parse(fit.lastSeen)), t),
            })}`
      }
      price={
        fit.value === null ? undefined : (
          <Trans
            i18nKey="fittings.popular.value"
            components={{ isk: <IskAmount value={fit.value} /> }}
          />
        )
      }
      modules={fit.parts.modules}
      disabled={disabled}
      onOpen={onOpen}
    />
  );
}

/**
 * An EVE Workbench guide: when it was published, its price at the Default
 * Trade Hub (and what that leaves unpriced), its zKillboard sighting, and a
 * Load that failed.
 */
function GuideFitRow({
  shared,
  guide,
  now,
  hub,
  disabled,
  onOpen,
}: SourceRowProps & { guide: WorkbenchRow; hub: string }) {
  const { t } = useTranslation();
  const { fit, modules, price, sighting, loadFailed } = guide;
  return (
    <PopularFitRow
      {...shared}
      meta={` · ${t('fittings.popular.workbench.created', {
        age: formatAge(Math.max(0, now - fit.dateAdded), t),
      })}`}
      price={price === undefined ? undefined : <WorkbenchFitPrice price={price} />}
      modules={modules}
      disabled={disabled}
      onOpen={onOpen}
    >
      {price?.partial && (
        <p className="text-xs text-text-dim">
          {t('fittings.popular.workbench.unpriced', { count: price.unpricedTypes, hub })}
        </p>
      )}
      <WorkbenchSightingBadge sighting={sighting} />
      {loadFailed && <InlineError>{t('fittings.popular.workbench.loadFailed')}</InlineError>}
    </PopularFitRow>
  );
}

/** The skills a fit still needs, opened from its verdict, with Fit Check's add-to-plan bar. */
function InlineMissingSkills({
  entries,
  characterId,
  fittingName,
}: {
  entries: readonly MissingSkill[];
  characterId: number;
  fittingName: string;
}) {
  const missing = useMissingSkillRows(entries, characterId);
  if (!missing) return <Spinner size="sm" delayMs={200} />;
  return (
    <MissingSkillsList
      entries={entries}
      characterId={characterId}
      fittingName={fittingName}
      missing={missing}
    />
  );
}

/**
 * A Workbench row's price at the Default Trade Hub, in the zKillboard row's
 * "~87.5M ISK" style. A partial total's missing items are on the line below.
 */
function WorkbenchFitPrice({ price }: { price: FitSellPrice }) {
  return (
    <Trans
      i18nKey={
        price.partial
          ? 'fittings.popular.workbench.pricePartial'
          : 'fittings.popular.workbench.price'
      }
      components={{ isk: <IskAmount value={price.sell} /> }}
    />
  );
}

/**
 * One ship, one flat list of skill rows tagged by source: Mastery tiers,
 * an optionally attached fit, or both. Search picks the ship; pasting a fit
 * auto-switches it to match the fit's own hull when they differ.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterChip,
  Panel,
  SearchInput,
  sortRows,
  Spinner,
  StatChip,
} from '@/components/ui';
import { fieldBaseClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { formatDuration } from '@/lib/duration';
import { rankedSearch } from '@/lib/rankedSearch';
import { readFromClipboard } from '@/lib/clipboard';
import { romanLevel } from '@/engine/projection';
import type {
  Attributes,
  CloneState,
  EngineSkill,
  Implants,
  PlanEntry,
  TrainedSkill,
} from '@/engine/types';
import { loadUniverseType } from '../data';
import { loadKnownRequirements } from '@/features/fittings/skillRequirements';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { loadItemNameMap, loadSkillNameMap } from '../typeCatalog';
import { previewClipboardImport } from '../planner/clipboardImport';
import { loadMasteries, loadTypes } from '@/sde/loadSde';
import type { MasteryMap, SkillPrereq } from '@/sde/types';
import { SkillRow } from '../SkillRow';
import type { TargetPlan } from '../useTargetPlan';
import { TargetPlanPicker } from '../TargetPlanPicker';
import { buildShipsWithMastery, type ShipOption } from './shipCatalog';
import { scheduleEntries } from './scheduleEntries';
import { buildFitCheckRows, type FitCheckRow } from './fitCheckRows';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import {
  dropCoveredRows,
  masteryRowSortValue,
  mergeShipEntries,
  nextUnmetMasteryTier,
  tagUnifiedRows,
  type UnifiedShipRow,
} from './unifiedShipRows';

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 20;
const EMPTY_TIERS: readonly (readonly SkillPrereq[])[] = [[], [], [], [], []];
const NO_REQUIRED: readonly RequiredSkill[] = [];
/** Static provenance badge — matches the size DESIGN.md's type scale names for chips/badges. Neither tag is interactive/selected, so neither takes accent (DESIGN.md §6). */
const SOURCE_TAG_CLASS =
  'rounded-xs border border-line px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

export interface ShipsPanelProps {
  target: TargetPlan;
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

type FitState =
  | { kind: 'idle' }
  | { kind: 'notEftFit' }
  | { kind: 'result'; shipName?: string; entries: PlanEntry[]; warnings: string[] };

export function ShipsPanel({
  target,
  skills,
  trainedSkills,
  attributes,
  implants,
  cloneState,
}: ShipsPanelProps) {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [masteries, setMasteries] = useState<MasteryMap | null>(null);
  const [ships, setShips] = useState<ShipOption[] | null>(null);
  const [selected, setSelected] = useState<ShipOption | null>(null);

  const [attaching, setAttaching] = useState(false);
  const [fitText, setFitText] = useState('');
  const [checkingFit, setCheckingFit] = useState(false);
  const [fit, setFit] = useState<FitState>({ kind: 'idle' });

  const [hideCompleted, setHideCompleted] = useState(false);
  const [showMastery, setShowMastery] = useState(true);
  const [showFit, setShowFit] = useState(true);
  // The hull's own required-to-fly skills, keyed by the ship they were loaded for so a stale result never shows under a newly picked hull.
  const [requiredFor, setRequiredFor] = useState<{
    typeID: number;
    skills: readonly RequiredSkill[];
  } | null>(null);

  // True-current value for `handleCheckFit`'s async closure, where `selected` is frozen.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    void Promise.all([loadMasteries(), loadTypes()]).then(([m, types]) => {
      setMasteries(m);
      setShips(buildShipsWithMastery(types, m));
    });
  }, []);

  const selectedTypeID = selected?.typeID;
  useEffect(() => {
    if (selectedTypeID === undefined) return;
    let cancelled = false;
    void loadKnownRequirements(selectedTypeID)
      .catch(() => null)
      .then((skills) => {
        if (!cancelled) setRequiredFor({ typeID: selectedTypeID, skills: skills ?? NO_REQUIRED });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTypeID]);

  const results = useMemo(
    () =>
      ships
        ? rankedSearch(ships, debouncedQuery, { primary: (s) => s.name, limit: SEARCH_LIMIT })
        : [],
    [ships, debouncedQuery]
  );

  function selectShip(ship: ShipOption) {
    setSelected(ship);
    setQuery(ship.name);
    setDebouncedQuery('');
  }

  function clearFit() {
    setFit({ kind: 'idle' });
    setFitText('');
    setAttaching(false);
  }

  function pickShip(ship: ShipOption) {
    selectShip(ship);
    // A fit attached for a different hull no longer describes this ship.
    if (
      fit.kind === 'result' &&
      fit.shipName &&
      fit.shipName.toLowerCase() !== ship.name.toLowerCase()
    ) {
      clearFit();
    }
  }

  async function handleCheckFit() {
    const startedWith = selectedRef.current;
    setCheckingFit(true);
    try {
      const [skillByName, typeByName] = await Promise.all([loadSkillNameMap(), loadItemNameMap()]);
      const preview = await previewClipboardImport(fitText, {
        skillByName,
        typeByName,
        loadType: loadUniverseType,
      });
      if (preview.mode !== 'eftFit') {
        setFit({ kind: 'notEftFit' });
        return;
      }
      setFit({
        kind: 'result',
        shipName: preview.shipName,
        entries: preview.entries,
        warnings: preview.warnings,
      });
      // Auto-switch via `selectShip`, not `pickShip` (which would read this
      // closure's stale `fit` and immediately clear the result just set).
      // Skipped if the selection changed mid-flight, so a slow parse can't
      // clobber a reselect the user made while it was pending.
      if (preview.shipName && ships && selectedRef.current?.typeID === startedWith?.typeID) {
        const matched = ships.find((s) => s.name.toLowerCase() === preview.shipName?.toLowerCase());
        if (matched && matched.typeID !== selectedRef.current?.typeID) selectShip(matched);
      }
    } finally {
      setCheckingFit(false);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const clip = await readFromClipboard();
      setFitText(clip);
      setFit({ kind: 'idle' });
    } catch {
      // Clipboard permission denied — the paste box is still there to type into.
    }
  }

  const fitResult = fit.kind === 'result' ? fit : null;
  const masteryTiers =
    selected && masteries ? (masteries[String(selected.typeID)] ?? EMPTY_TIERS) : EMPTY_TIERS;
  const fitEntries = fitResult?.entries ?? null;

  const merged = useMemo(
    () => mergeShipEntries(masteryTiers, fitEntries),
    [masteryTiers, fitEntries]
  );

  const scheduled = useMemo(
    () =>
      scheduleEntries(merged.entries, { skills, trainedSkills, attributes, implants, cloneState }),
    [merged.entries, skills, trainedSkills, attributes, implants, cloneState]
  );

  const rows: UnifiedShipRow[] = useMemo(() => {
    const built = buildFitCheckRows(merged.entries, skills, trainedSkills, scheduled);
    return tagUnifiedRows(built, merged.highestMasteryTier, merged.fromFit);
  }, [merged, skills, trainedSkills, scheduled]);

  const requiredEntries: PlanEntry[] = useMemo(
    () =>
      selectedTypeID !== undefined && requiredFor?.typeID === selectedTypeID
        ? requiredFor.skills
            .filter((req) => req.level > 0)
            .map((req) => ({ skillTypeID: req.skillTypeID, targetLevel: req.level }))
        : [],
    [requiredFor, selectedTypeID]
  );

  const requiredRows = useMemo(() => {
    const schedule = scheduleEntries(requiredEntries, {
      skills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
    });
    return buildFitCheckRows(requiredEntries, skills, trainedSkills, schedule);
  }, [requiredEntries, skills, trainedSkills, attributes, implants, cloneState]);

  const requiredMissing = requiredRows.filter((row) => row.status !== 'trained');
  const requiredSeconds = requiredMissing.reduce((sum, row) => sum + row.seconds, 0);

  const visibleRows = useMemo(() => {
    const filtered = dropCoveredRows(rows, requiredEntries).filter((row) => {
      const bySource = (showMastery && row.highestMasteryTier !== null) || (showFit && row.fromFit);
      if (!bySource) return false;
      if (hideCompleted && row.status === 'trained') return false;
      return true;
    });
    // Grouped by Mastery tier (I first), training time ascending within a
    // tier; trained rows have no orderable time left, so `sortRows` sinks
    // them last.
    return sortRows(filtered, { sortValue: masteryRowSortValue }, 'asc');
  }, [rows, requiredEntries, showMastery, showFit, hideCompleted]);

  const untrained = visibleRows.filter((row) => row.status !== 'trained');
  const totalSeconds = untrained.reduce((sum, row) => sum + row.seconds, 0);
  const nextTier = nextUnmetMasteryTier(masteryTiers, (id) => trainedSkills.get(id)?.level ?? 0);
  const untrainedFit = untrained.filter((row) => row.fromFit);
  const planNameFallback = selected?.name ?? fitResult?.shipName ?? t('plans.newPlanName');

  function tagsFor(row: UnifiedShipRow): ReactNode[] {
    const chips: ReactNode[] = [];
    if (row.highestMasteryTier !== null) {
      chips.push(
        <span key="mastery" className={SOURCE_TAG_CLASS}>
          {t('skills.ships.masteryTag', { roman: romanLevel(row.highestMasteryTier + 1) })}
        </span>
      );
    }
    if (row.fromFit) {
      chips.push(
        <span key="fit" className={SOURCE_TAG_CLASS}>
          {t('skills.ships.fitTag')}
        </span>
      );
    }
    return chips;
  }

  function addMasteryTier(tier: number) {
    const entries = masteryTiers[tier]
      .filter(({ skillTypeID, level }) => (trainedSkills.get(skillTypeID)?.level ?? 0) < level)
      .map(({ skillTypeID, level }) => ({ skillTypeID, targetLevel: level }));
    if (entries.length > 0) void target.addEntries(entries, planNameFallback);
  }

  function renderRow(row: FitCheckRow | UnifiedShipRow, tagged: boolean) {
    return (
      <div key={row.skillTypeID} className="border-b border-line py-1.5 last:border-b-0">
        <SkillRow
          name={row.name}
          status={row.status}
          currentLevel={row.currentLevel}
          tags={tagged ? tagsFor(row as UnifiedShipRow) : undefined}
          timeLabel={
            row.status === 'trained' ? t('skills.fitCheck.trained') : formatDuration(row.seconds)
          }
          addLabel={t('skills.fitCheck.add')}
          onAdd={() =>
            void target.addEntries(
              [{ skillTypeID: row.skillTypeID, targetLevel: row.targetLevel }],
              planNameFallback
            )
          }
        />
      </div>
    );
  }

  if (!ships) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const hasContext = selected !== null || fitResult !== null;

  return (
    <Panel
      title={t('skills.ships.title')}
      meta={hasContext && <span className="text-text-dim">{planNameFallback}</span>}
    >
      <div className="space-y-2 p-3">
        {hasContext && untrained.length > 0 && (
          <ImplantsAssumedNote hint={t('plans.assumesNoImplantsHint')} />
        )}
        <SearchInput
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder={t('skills.ships.searchPlaceholder')}
          aria-label={t('skills.ships.searchPlaceholder')}
        />
        {!selected && results.length > 0 && (
          <ul className="max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
            {results.map((ship) => (
              <li key={ship.typeID} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => pickShip(ship)}
                  className={`${tappableRowClassName} flex w-full items-center px-2 py-1.5 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`}
                >
                  {ship.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!selected && debouncedQuery.trim() !== '' && results.length === 0 && (
          <p className="text-xs text-text-dim">
            {t('skills.ships.noShipsMatch', { query: debouncedQuery })}
          </p>
        )}

        {hasContext && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label={t('skills.ships.filterMastery')}
              selected={showMastery}
              onToggle={() => setShowMastery((v) => !v)}
            />
            <FilterChip
              label={t('skills.ships.filterFit')}
              selected={showFit}
              onToggle={() => setShowFit((v) => !v)}
              disabled={!fitResult}
              tooltip={!fitResult ? t('skills.ships.filterFitDisabledTooltip') : undefined}
            />
            <FilterChip
              label={t('skills.ships.hideCompleted')}
              selected={hideCompleted}
              onToggle={() => setHideCompleted((v) => !v)}
            />
            {untrained.length > 0 && (
              <StatChip label={t('skills.ships.totalTime')} value={formatDuration(totalSeconds)} />
            )}
            <TargetPlanPicker target={target} />
          </div>
        )}

        {fitResult ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-dim">
              {t('skills.ships.fitAttached', {
                name: fitResult.shipName ?? t('skills.ships.fitAttachedFallback'),
              })}
            </span>
            <button
              type="button"
              onClick={clearFit}
              className="inline-flex min-h-11 items-center whitespace-nowrap text-xs text-text-dim underline md:min-h-0"
            >
              {t('skills.ships.removeFit')}
            </button>
          </div>
        ) : attaching ? (
          <div className="space-y-2">
            <label className="block text-xs text-text-dim" htmlFor="ships-fit-text">
              {t('skills.fitCheck.pasteLabel')}
            </label>
            <textarea
              id="ships-fit-text"
              value={fitText}
              onChange={(e) => {
                setFitText(e.target.value);
                setFit({ kind: 'idle' });
              }}
              rows={6}
              className={`${fieldBaseClassName} w-full p-2 text-xs`}
              placeholder={t('skills.fitCheck.pastePlaceholder')}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => void handlePasteFromClipboard()}>
                {t('plans.pasteFromClipboard')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleCheckFit()}
                disabled={checkingFit || fitText.trim() === ''}
              >
                {checkingFit ? <Spinner size="sm" /> : t('skills.fitCheck.checkButton')}
              </Button>
            </div>
            {fit.kind === 'notEftFit' && (
              <p className="text-xs text-danger">{t('skills.fitCheck.notEftFit')}</p>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAttaching(true)}
              className="inline-flex min-h-11 items-center whitespace-nowrap text-xs text-text-dim underline md:min-h-0"
            >
              {t('skills.ships.attachFit')}
            </button>
            <p className="text-xs text-text-dim">{t('skills.ships.attachFitHint')}</p>
          </>
        )}
        {fitResult?.warnings.map((warning, i) => (
          <p key={`${i}:${warning}`} className="text-xs text-warning">
            {warning}
          </p>
        ))}
        <p className="text-xs text-text-dim">{t('skills.ships.suggestedNote')}</p>
      </div>

      {hasContext && (
        <>
          {requiredEntries.length > 0 && (
            <div className="space-y-1 border-t border-line p-3">
              <p
                className={`text-base font-semibold ${requiredMissing.length === 0 ? 'text-success' : 'text-text'}`}
              >
                {requiredMissing.length === 0
                  ? t('skills.ships.canFly')
                  : t('skills.ships.canFlyIn', {
                      time: formatDuration(requiredSeconds),
                      count: requiredMissing.length,
                    })}
              </p>
              <GroupHeader title={t('skills.ships.requiredGroup')}>
                {requiredMissing.length > 0 && target.plans !== undefined && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void target.addEntries(
                        requiredMissing.map((row) => ({
                          skillTypeID: row.skillTypeID,
                          targetLevel: row.targetLevel,
                        })),
                        planNameFallback
                      )
                    }
                  >
                    {t('skills.ships.addRequired', { count: requiredMissing.length })}
                  </Button>
                )}
              </GroupHeader>
              {requiredRows.map((row) => renderRow(row, false))}
            </div>
          )}
          <div className="space-y-1 border-t border-line p-3">
            <GroupHeader title={t('skills.ships.masteryGroup')}>
              {target.plans !== undefined && (
                <div className="flex flex-wrap items-center gap-2">
                  {untrainedFit.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void target.addEntries(
                          untrainedFit.map((row) => ({
                            skillTypeID: row.skillTypeID,
                            targetLevel: row.targetLevel,
                          })),
                          planNameFallback
                        )
                      }
                    >
                      {t('skills.ships.addFit', { count: untrainedFit.length })}
                    </Button>
                  )}
                  {nextTier !== null && (
                    <div className="flex items-center">
                      <Button
                        size="sm"
                        variant="primary"
                        className="rounded-r-none"
                        onClick={() => addMasteryTier(nextTier)}
                      >
                        {target.plans.length === 0
                          ? t('skills.ships.createAndAddMastery', {
                              roman: romanLevel(nextTier + 1),
                            })
                          : t('skills.ships.addMastery', { roman: romanLevel(nextTier + 1) })}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="primary"
                            className="rounded-l-none border-l border-line"
                            aria-label={t('skills.ships.chooseMasteryTier')}
                          >
                            ▾
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {masteryTiers.map((_, tier) => (
                            <DropdownMenuItem key={tier} onSelect={() => addMasteryTier(tier)}>
                              {t('skills.ships.masteryTag', { roman: romanLevel(tier + 1) })}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              )}
            </GroupHeader>
            {visibleRows.length === 0 ? (
              <EmptyState title={t('skills.ships.emptyTitle')} hint={t('skills.ships.emptyHint')} />
            ) : (
              visibleRows.map((row) => renderRow(row, true))
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function GroupHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1">
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

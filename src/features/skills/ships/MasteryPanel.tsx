/**
 * Search a ship, see its 5 Mastery tiers against the Character's trained
 * skills, bundle a tier's shortfall into the Target Plan in one action.
 * `masteries.json` is static SDE data — no ESI call to list ships/tiers.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, FilterChip, Panel, SearchInput, Spinner } from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { rankedSearch } from '@/lib/rankedSearch';
import { romanLevel } from '@/engine/projection';
import type { Attributes, CloneState, EngineSkill, Implants, TrainedSkill } from '@/engine/types';
import { loadMasteries, loadTypes } from '@/sde/loadSde';
import type { MasteryMap } from '@/sde/types';
import { SkillRow } from '../SkillRow';
import type { TargetPlan } from '../useTargetPlan';
import { TargetPlanPicker } from '../TargetPlanPicker';
import { buildShipsWithMastery, type ShipOption } from './shipCatalog';
import { buildMasteryTierRow, type MasteryTierRow } from './masteryRows';
import { scheduleEntries } from './scheduleEntries';

/** Debounce for the ship search, matching SkillPicker's skill search — a fast typist doesn't re-rank the ship list on every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 20;

export interface MasteryPanelProps {
  target: TargetPlan;
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

export function MasteryPanel({
  target,
  skills,
  trainedSkills,
  attributes,
  implants,
  cloneState,
}: MasteryPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [masteries, setMasteries] = useState<MasteryMap | null>(null);
  const [ships, setShips] = useState<ShipOption[] | null>(null);
  const [selected, setSelected] = useState<ShipOption | null>(null);
  // One tier open at a time: each open, incomplete tier renders its own
  // primary "Add Level to Plan" button, and DESIGN.md §6 allows only one
  // primary button per view.
  const [expandedTier, setExpandedTier] = useState<number | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);

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

  const results = useMemo(
    () =>
      ships
        ? rankedSearch(ships, debouncedQuery, { primary: (s) => s.name, limit: SEARCH_LIMIT })
        : [],
    [ships, debouncedQuery]
  );

  const tiers: MasteryTierRow[] | null = useMemo(() => {
    if (!selected || !masteries) return null;
    const bundles = masteries[String(selected.typeID)];
    if (!bundles) return null;
    return bundles.map((bundle, tier) => {
      const entries = bundle.map((s) => ({ skillTypeID: s.skillTypeID, targetLevel: s.level }));
      const scheduled = scheduleEntries(entries, {
        skills,
        trainedSkills,
        attributes,
        implants,
        cloneState,
      });
      return buildMasteryTierRow(tier, bundle, skills, trainedSkills, scheduled);
    });
  }, [selected, masteries, skills, trainedSkills, attributes, implants, cloneState]);

  function toggle(tier: number) {
    setExpandedTier((prev) => (prev === tier ? null : tier));
  }

  function tierTrailing(tierRow: MasteryTierRow) {
    if (tierRow.rows.length === 0) return t('skills.mastery.tierEmpty');
    if (tierRow.complete) return t('skills.mastery.tierComplete', { count: tierRow.rows.length });
    return t('skills.mastery.tierProgress', {
      done: tierRow.rows.filter((r) => r.status === 'trained').length,
      total: tierRow.rows.length,
      time: formatDuration(tierRow.totalSeconds),
    });
  }

  if (!ships) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title={t('skills.mastery.title')}>
        <div className="space-y-2 p-3">
          <SearchInput
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setExpandedTier(null);
            }}
            placeholder={t('skills.mastery.searchPlaceholder')}
            aria-label={t('skills.mastery.searchPlaceholder')}
          />
          {!selected && results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-xs border border-line bg-panel">
              {results.map((ship) => (
                <li key={ship.typeID} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(ship);
                      setQuery(ship.name);
                      setDebouncedQuery('');
                      setExpandedTier(0);
                    }}
                    className="w-full px-2 py-1.5 text-left text-xs hover:bg-panel-2"
                  >
                    {ship.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!selected && debouncedQuery.trim() !== '' && results.length === 0 && (
            <p className="text-xs text-text-dim">
              {t('skills.mastery.noShipsMatch', { query: debouncedQuery })}
            </p>
          )}
          <p className="text-xs text-text-dim">{t('skills.mastery.suggestedNote')}</p>
        </div>
      </Panel>

      {selected && tiers && (
        <Panel
          title={t('skills.mastery.tiersTitle', { ship: selected.name })}
          actions={
            <FilterChip
              label={t('skills.mastery.hideCompleted')}
              selected={hideCompleted}
              onToggle={() => setHideCompleted((prev) => !prev)}
            />
          }
        >
          <div className="divide-y divide-line">
            {tiers.map((tierRow) => {
              const visibleRows = hideCompleted
                ? tierRow.rows.filter((row) => row.status !== 'trained')
                : tierRow.rows;
              return (
                <Disclosure
                  key={tierRow.tier}
                  expanded={expandedTier === tierRow.tier}
                  onToggle={() => toggle(tierRow.tier)}
                  label={t('skills.mastery.tierLabel', { roman: romanLevel(tierRow.tier + 1) })}
                  trailing={tierTrailing(tierRow)}
                >
                  <div className="space-y-1 p-3">
                    {visibleRows.length === 0 && tierRow.rows.length > 0 && (
                      <p className="text-xs text-text-dim">{t('skills.mastery.tierAllHidden')}</p>
                    )}
                    {visibleRows.map((row) => (
                      <SkillRow
                        key={row.skillTypeID}
                        name={row.name}
                        status={row.status}
                        currentLevel={row.currentLevel}
                        timeLabel={
                          row.status === 'trained'
                            ? t('skills.fitCheck.trained')
                            : formatDuration(row.seconds)
                        }
                      />
                    ))}
                    {!tierRow.complete && tierRow.rows.length > 0 && target.plans !== undefined && (
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <TargetPlanPicker target={target} />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            void target.addEntries(
                              tierRow.rows
                                .filter((r) => r.status !== 'trained')
                                .map((r) => ({
                                  skillTypeID: r.skillTypeID,
                                  targetLevel: r.targetLevel,
                                })),
                              t('skills.mastery.newPlanName', { ship: selected.name })
                            )
                          }
                        >
                          {target.plans.length === 0
                            ? t('skills.fitCheck.createPlanAndAdd')
                            : t('skills.mastery.addLevelToPlan')}
                        </Button>
                      </div>
                    )}
                  </div>
                </Disclosure>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

import { useCharacters } from '@/features/character/useCharacters';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import {
  Button,
  Checkbox,
  EmptyState,
  PageHeader,
  Panel,
  Tooltip,
  eyebrowClassName,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { compareFittingStats, headToHeadWins } from '@/engine/fittings/fittingCompare';
import { canFlyVerdict, fitVerdict } from '@/features/fittings/compareVerdicts';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useCompareCodes, MAX_COMPARE_SLOTS } from '@/features/fittings/compareUrl';
import { FittingComparePicker } from '@/features/fittings/FittingComparePicker';
import { FITTINGS_PATH, readCompareOrigin } from '@/features/fittings/fittingRoutes';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { OriginCrumb } from '@/components/OriginCrumb';
import { cx } from '@/lib/cx';
import { useCompareCanFly } from '@/features/fittings/useCompareCanFly';
import { useCompareFittings } from '@/features/fittings/useCompareFittings';
import { useComparePrice } from '@/features/fittings/useComparePrice';
import { useCompareStats } from '@/features/fittings/useCompareStats';
import { useDamageProfiles } from '@/features/fittings/damageProfiles';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';
import { useShipDataNeedsConnection } from '@/features/fittings/useDogmaEngineStatus';
import {
  fittingCompareCsvColumns,
  type FittingCompareCsvRow,
} from '@/features/fittings/fittingCompareCsv';
import {
  COMPARE_FOCUS_TARGET,
  CompareErrorCard,
  CompareFitCard,
  CompareLoadingCard,
  type CompareCardBadge,
} from '@/features/fittings/CompareFitCard';
import { CompareHeadToHead } from '@/features/fittings/CompareHeadToHead';
import { CompareLoadout } from '@/features/fittings/CompareLoadout';
import { CompareAllStats } from '@/features/fittings/CompareAllStats';
import { CompareScenarioLine } from '@/features/fittings/CompareScenarioLine';
import {
  COMPARE_GRID_CLASS,
  compareGridStyle,
  compareLetter,
  type CompareColumn,
} from '@/features/fittings/compareFormat';
import { useTypeNames } from '@/features/character/useTypeNames';

type PickerMode = { kind: 'add' } | { kind: 'replace'; index: number };

export function FittingCompare() {
  const { t } = useTranslation();
  const location = useLocation();
  const origin = readCompareOrigin(location.state);
  const [codes, setCodes] = useCompareCodes();
  const slots = useCompareFittings(codes);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const {
    profile,
    failed: profileFailed,
    skillsKnown,
    retry: retryProfile,
  } = usePilotProfile(activeCharacterId);
  const allCharacters = useCharacters();
  const characterOptions = useMemo(
    () => allCharacters.map(({ characterId, name }) => ({ characterId, name })),
    [allCharacters]
  );
  const fittings = useMemo(() => slots.map((slot) => slot?.fitting ?? null), [slots]);
  const damageProfiles = useDamageProfiles();
  const targetProfiles = useTargetProfiles();
  const target = targetProfiles.selected;
  const stats = useCompareStats(fittings, profile);
  const canFly = useCompareCanFly(fittings, profile);
  const price = useComparePrice(fittings, profile);
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const addFittingRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef(codes.length);
  useLayoutEffect(() => {
    countRef.current = codes.length;
  });

  const count = codes.length;
  const hullIds = useMemo(
    () => fittings.flatMap((fitting) => (fitting ? [fitting.shipTypeId] : [])),
    [fittings]
  );
  const hullNames = useTypeNames(hullIds);

  function pick(code: string) {
    if (picker?.kind === 'replace') {
      const at = picker.index;
      setCodes((prev) => prev.map((existing, i) => (i === at ? code : existing)));
      return;
    }
    setCodes((prev) => [...prev, code].slice(0, MAX_COMPARE_SLOTS));
  }
  function makeBaseline(index: number) {
    setCodes((prev) => [prev[index]!, ...prev.filter((_, i) => i !== index)]);
  }
  function removeSlot(index: number) {
    setCodes((prev) => prev.filter((_, i) => i !== index));
    const expected = codes.length - 1;
    const afterRemoval = (find: () => HTMLElement | null | undefined) => () =>
      countRef.current === expected ? find() : null;
    const removeAt = (i: number) =>
      afterRemoval(() =>
        document
          .querySelector(`[data-compare-focus="${i}"]`)
          ?.querySelector<HTMLElement>(COMPARE_FOCUS_TARGET)
      );
    focusAfterCommit(
      removeAt(index),
      removeAt(index - 1),
      afterRemoval(() => addFittingRef.current)
    );
  }

  const anyError = slots.some((slot) => slot?.shareError);
  const anyStatsFailed = stats.failed.some(Boolean);
  const shipDataNeedsConnection = useShipDataNeedsConnection();
  const okSlots = useMemo(
    () => stats.values.flatMap((s, index) => (s && fittings[index] ? [index] : [])),
    [stats.values, fittings]
  );
  const settled =
    count > 0 &&
    !anyError &&
    slots.every((slot) => slot !== null) &&
    stats.values.every((s, index) => s !== null || stats.failed[index]);
  const statsReady = settled && okSlots.length > 0;
  const comparing = okSlots.length >= 2;
  const showDifferencesOnly = differencesOnly && comparing;

  const priceSettled = okSlots.every(
    (index) => price.values[index] !== null || price.failed[index]
  );
  const pricesReady = priceSettled && okSlots.some((index) => price.values[index] !== null);
  const anyPriceFailed = okSlots.some((index) => price.failed[index]);

  const okStats = useMemo(
    () => okSlots.map((index) => stats.values[index] as FittingStats),
    [okSlots, stats.values]
  );
  const okFittings = useMemo(
    () => okSlots.map((index) => fittings[index] as Fitting),
    [okSlots, fittings]
  );
  const columns = useMemo<CompareColumn[]>(
    () =>
      codes.map((_, index) => {
        const position = okSlots.indexOf(index);
        return { letter: compareLetter(index), position: position === -1 ? null : position };
      }),
    [codes, okSlots]
  );
  const table = useMemo(
    () =>
      statsReady
        ? compareFittingStats(
            okStats,
            target,
            pricesReady ? okSlots.map((index) => price.values[index]) : undefined
          )
        : null,
    [statsReady, okStats, okSlots, target, pricesReady, price.values]
  );
  const wins = useMemo(
    () =>
      table && comparing
        ? headToHeadWins(table.rows).map((keys) =>
            keys.map((key) => t(`fittings.compare.headToHead.${key}`))
          )
        : [],
    [table, comparing, t]
  );

  const csvFittings = useMemo(
    () =>
      slots.map((slot, index) => {
        const position = okSlots.indexOf(index);
        return {
          name: slot?.fitting?.name ?? '',
          statsIndex: position === -1 ? null : position,
          fits: fitVerdict(t, stats.values[index])?.text ?? null,
          canFly:
            canFlyVerdict(t, canFly.values[index], Boolean(canFly.failed[index]))?.text ?? null,
        };
      }),
    [slots, okSlots, stats.values, canFly.values, canFly.failed, t]
  );
  const statsCsvColumns = useMemo(() => fittingCompareCsvColumns(t, csvFittings), [t, csvFittings]);
  const statsCsvRows = useMemo<FittingCompareCsvRow[]>(
    () =>
      table
        ? [
            { fact: 'fits' },
            { fact: 'canFly' },
            ...(showDifferencesOnly ? table.rows.filter((row) => row.differs) : table.rows),
          ]
        : [],
    [table, showDifferencesOnly]
  );
  const statsExport = useTableExport({
    surface: 'fitting-compare',
    rows: statsCsvRows,
    columns: statsCsvColumns,
    source: 'rows',
  });

  function badgesFor(index: number): CompareCardBadge[] {
    const code = codes[index];
    const badges: CompareCardBadge[] = [];
    if (comparing && okSlots[0] === index) badges.push('baseline');
    if (origin?.savedCode !== undefined && code === origin.savedCode) badges.push('saved');
    if (origin?.editedCode !== undefined && code === origin.editedCode) badges.push('edits');
    return badges;
  }

  function cardFor(index: number) {
    const slot = slots[index];
    const letter = compareLetter(index);
    if (slot === null || slot === undefined) return <CompareLoadingCard focusIndex={index} />;
    if (slot.shareError || !slot.fitting) {
      return (
        <CompareErrorCard
          letter={letter}
          message={t(`fittings.load.shareError.${slot.shareError ?? 'invalid'}`)}
          focusIndex={index}
          onRemove={() => removeSlot(index)}
        />
      );
    }
    const position = okSlots.indexOf(index);
    return (
      <CompareFitCard
        letter={letter}
        fitting={slot.fitting}
        code={codes[index]}
        hullName={hullNames.get(slot.fitting.shipTypeId)}
        badges={badgesFor(index)}
        fits={fitVerdict(t, stats.values[index])}
        fly={canFlyVerdict(t, canFly.values[index], Boolean(canFly.failed[index]))}
        characters={characterOptions}
        price={price.values[index]?.sell ?? null}
        wins={position === -1 ? [] : (wins[position] ?? [])}
        statsFailed={Boolean(stats.failed[index])}
        focusIndex={index}
        onMakeBaseline={index === (okSlots[0] ?? 0) ? undefined : () => makeBaseline(index)}
        onReplace={() => setPicker({ kind: 'replace', index })}
        onRemove={() => removeSlot(index)}
      />
    );
  }

  const slotsFull = count >= MAX_COMPARE_SLOTS;

  return (
    <div className="mx-auto max-w-page space-y-3">
      <PageHeader
        title={t('fittings.compare.title')}
        actions={
          <>
            {origin ? (
              <OriginCrumb to={origin.back}>{origin.name}</OriginCrumb>
            ) : (
              <OriginCrumb to={FITTINGS_PATH} className="md:hidden">
                {t('ships.tabs.fittings')}
              </OriginCrumb>
            )}
            <Tooltip
              content={
                slotsFull ? t('fittings.compare.slotsFull', { count: MAX_COMPARE_SLOTS }) : null
              }
            >
              <Button
                ref={addFittingRef}
                variant="primary"
                aria-disabled={slotsFull || undefined}
                onClick={() => {
                  if (!slotsFull) setPicker({ kind: 'add' });
                }}
              >
                {t('fittings.compare.addFitting')}
              </Button>
            </Tooltip>
          </>
        }
      />

      {count === 0 ? (
        <EmptyState
          title={t('fittings.compare.emptyTitle')}
          hint={
            <Trans
              i18nKey="fittings.compare.emptyHint"
              components={{
                library: <Link to={FITTINGS_PATH} className={inlineLinkClassName} />,
              }}
            />
          }
          action={
            <Button onClick={() => setPicker({ kind: 'add' })}>
              {t('fittings.compare.addFitting')}
            </Button>
          }
        />
      ) : (
        <>
          <CompareScenarioLine damageProfiles={damageProfiles} targetProfiles={targetProfiles} />

          <div
            data-testid="compare-cards"
            className={cx(
              COMPARE_GRID_CLASS,
              'edge-fade-x gap-y-3 md:border md:border-transparent md:px-3 max-md:flex max-md:snap-x max-md:overflow-x-auto max-md:pb-1'
            )}
            style={compareGridStyle(count)}
          >
            <div className="hidden md:block" />
            {codes.map((code, index) => (
              <div
                key={`${index}:${code}`}
                className="max-md:w-[72vw] max-md:max-w-80 max-md:shrink-0 max-md:snap-start"
              >
                {cardFor(index)}
              </div>
            ))}
          </div>

          {!skillsKnown && (
            <p className="text-xs text-warning">{t('fittings.stats.skillsUnknown')}</p>
          )}

          {!statsReady ? (
            <Panel>
              <p className={profileFailed ? 'text-xs text-danger' : 'text-xs text-text-dim'}>
                {profileFailed
                  ? t('fittings.compare.profileFailed')
                  : anyError
                    ? t('fittings.compare.fixErrorsHint')
                    : anyStatsFailed
                      ? t(
                          shipDataNeedsConnection
                            ? 'fittings.compare.statsOfflineHint'
                            : 'fittings.compare.statsFailedHint'
                        )
                      : t('fittings.stats.loadingIndeterminate')}
              </p>
              {!profileFailed && !anyError && anyStatsFailed && (
                <Button className="mt-2" onClick={stats.retry}>
                  {t('common.retry')}
                </Button>
              )}
              {profileFailed && (
                <Button className="mt-2" onClick={retryProfile}>
                  {t('fittings.compare.profileRetry')}
                </Button>
              )}
            </Panel>
          ) : (
            <>
              <CompareHeadToHead rows={table!.rows} columns={columns} />
              {!pricesReady && (
                <p className="text-xs text-text-dim">
                  {anyPriceFailed
                    ? t('fittings.compare.priceFailed')
                    : t('fittings.compare.priceLoading')}
                </p>
              )}
              {comparing && <CompareLoadout fittings={okFittings} columns={columns} />}
              <section className="space-y-2" aria-labelledby="compare-all-stats">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="compare-all-stats" className={eyebrowClassName}>
                    {t('fittings.compare.statsTitle')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
                      <Tooltip
                        content={comparing ? null : t('fittings.compare.differencesNeedsTwo')}
                      >
                        <Checkbox
                          checked={showDifferencesOnly}
                          aria-disabled={!comparing || undefined}
                          onChange={() => {
                            if (comparing) setDifferencesOnly((v) => !v);
                          }}
                        />
                      </Tooltip>
                      {t('fittings.compare.differencesOnly')}
                    </label>
                    {statsCsvRows.length > 0 && (
                      <TableActionsMenu
                        name={t('fittings.compare.statsTitle')}
                        tableExport={statsExport}
                      />
                    )}
                  </div>
                </div>
                <CompareAllStats
                  rows={table!.rows}
                  statsList={okStats}
                  columns={columns}
                  differencesOnly={showDifferencesOnly}
                  onShowMatching={() => setDifferencesOnly(false)}
                />
              </section>
              <p className="text-xs text-text-dim">{t('fittings.appliedDps.assumptions')}</p>
            </>
          )}
        </>
      )}

      <FittingComparePicker
        open={picker !== null}
        title={
          picker?.kind === 'replace'
            ? t('fittings.compare.replaceTitle', {
                name:
                  fittings[picker.index]?.name ??
                  t('fittings.compare.slotFallback', { n: compareLetter(picker.index) }),
              })
            : undefined
        }
        onClose={() => setPicker(null)}
        characterId={activeCharacterId}
        onAdd={pick}
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  EmptyState,
  IconButton,
  MenuItem,
  PageHeader,
  Panel,
  RowActionsMenu,
  RowMoreActions,
  Spinner,
  Checkbox,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  compareFittingStats,
  compareWindow,
  modulesThatDiffer,
} from '@/engine/fittings/fittingCompare';
import { firstResourceOverage } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useIsPhone } from '@/lib/useIsPhone';
import { useCompareCodes, MAX_COMPARE_SLOTS } from '@/features/fittings/compareUrl';
import { FittingComparePicker } from '@/features/fittings/FittingComparePicker';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { FittingCompareModulesSummary } from '@/features/fittings/FittingCompareModulesSummary';
import {
  FittingCompareTable,
  type FittingCompareColumn,
} from '@/features/fittings/FittingCompareTable';
import { CompareCanFlyByCharacter } from '@/features/fittings/CompareCanFlyByCharacter';
import { useCompareCanFly } from '@/features/fittings/useCompareCanFly';
import { useCompareFittings } from '@/features/fittings/useCompareFittings';
import { useComparePrice } from '@/features/fittings/useComparePrice';
import { useCompareStats } from '@/features/fittings/useCompareStats';
import { AbyssalWeatherPicker } from '@/features/fittings/AbyssalWeatherPicker';
import { DamageProfilePicker } from '@/features/fittings/DamageProfilePicker';
import { useDamageProfiles } from '@/features/fittings/damageProfiles';
import { TargetProfilePicker } from '@/features/fittings/TargetProfilePicker';
import { useTargetProfiles } from '@/features/fittings/targetProfiles';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';

/**
 * Fitting vs Fitting compare: up to three Fittings, entirely in the URL
 * (`?f=…&f=…&f=…`) — copying the address bar reproduces the same comparison.
 * Phone shows two columns at a time with paging.
 */
export function FittingCompare() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [codes, setCodes] = useCompareCodes();
  const slots = useCompareFittings(codes);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const {
    profile,
    failed: profileFailed,
    retry: retryProfile,
  } = usePilotProfile(activeCharacterId);
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
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
  const isPhone = useIsPhone();
  const [page, setPage] = useState(0);
  const [differencesOnly, setDifferencesOnly] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const count = codes.length;
  const pageWindow = isPhone ? compareWindow(count, page) : { start: 0, end: count };
  const visible = Array.from(
    { length: pageWindow.end - pageWindow.start },
    (_, i) => pageWindow.start + i
  );

  function addCode(code: string) {
    setCodes([...codes, code].slice(0, MAX_COMPARE_SLOTS));
  }
  function removeSlot(index: number) {
    setCodes(codes.filter((_, i) => i !== index));
  }

  const anyError = slots.some((slot) => slot?.shareError);
  const anyStatsFailed = stats.failed.some(Boolean);
  // Slots whose stats calculated. A slot that failed is left out of the table (its column shows a
  // dash) so one bad Fitting doesn't hide the rest; best/differs are worked out over these only.
  const okSlots = useMemo(
    () => stats.values.flatMap((s, index) => (s ? [index] : [])),
    [stats.values]
  );
  const settled =
    count > 0 &&
    !anyError &&
    slots.every((slot) => slot !== null) &&
    stats.values.every((s, index) => s !== null || stats.failed[index]);
  const statsReady = settled && okSlots.length > 0;
  // One Fitting has nothing to differ from, so show all its stats rather than an empty table.
  const showDifferencesOnly = differencesOnly && okSlots.length >= 2;

  // Price rows join the table once every shown Fitting's hub fetch has settled (succeeded or
  // failed) — a slower network fetch than the stats calc must not delay the rest of the table
  // from appearing. A settled failure on one slot still lets the rest show their price, same as
  // `okSlots` doing this for `stats` above.
  const priceSettled = okSlots.every(
    (index) => price.values[index] !== null || price.failed[index]
  );
  const pricesReady = priceSettled && okSlots.some((index) => price.values[index] !== null);
  const anyPriceFailed = okSlots.some((index) => price.failed[index]);

  const table = useMemo(
    () =>
      statsReady
        ? compareFittingStats(
            okSlots.map((index) => stats.values[index] as FittingStats),
            target,
            pricesReady ? okSlots.map((index) => price.values[index]) : undefined
          )
        : null,
    [statsReady, okSlots, stats.values, target, pricesReady, price.values]
  );
  const moduleDiffs = useMemo(
    () => (statsReady ? modulesThatDiffer(okSlots.map((index) => fittings[index] as Fitting)) : []),
    [statsReady, okSlots, fittings]
  );
  const statsPosition = (index: number) => {
    const position = okSlots.indexOf(index);
    return position === -1 ? null : position;
  };

  function headerFor(index: number) {
    const slot = slots[index];
    if (slot === null || slot === undefined) {
      return (
        <div className="flex justify-end">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      );
    }
    if (slot.shareError) {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className="text-danger">{t(`fittings.load.shareError.${slot.shareError}`)}</span>
          <IconButton
            icon={<Icon.Close />}
            label={t('fittings.compare.remove')}
            onClick={() => removeSlot(index)}
          />
        </div>
      );
    }
    const flies = canFly.values[index];
    const fitStats = stats.values[index];
    // Whole-fit CPU/PG/calibration budget — additional to "Can fly" (a skills check), not a
    // replacement: a fit can fly but not fit (over budget), and the two must read distinctly.
    const overage = fitStats ? firstResourceOverage(fitStats) : null;
    const name = slot.fitting?.name ?? '';
    const code = codes[index];
    // A column's own actions, on right-click or its ⋮ (there is no baseline column to promote).
    const items = (
      <>
        <MenuItem
          disabled={code === undefined}
          onSelect={() => code && navigate(fittingEditLocation(code))}
        >
          {t('fittings.compare.openInEditor')}
        </MenuItem>
        <MenuItem className="text-danger" onSelect={() => removeSlot(index)}>
          {t('fittings.compare.remove')}
        </MenuItem>
      </>
    );
    return (
      <RowActionsMenu name={name} items={items}>
        <div className="flex flex-col items-end gap-1">
          <span className="max-w-40 truncate font-medium sm:max-w-full text-text">
            {slot.fitting?.name}
          </span>
          {stats.failed[index] && (
            <span className="text-danger">{t('fittings.compare.statsFailed')}</span>
          )}
          {fitStats && (
            <span className={overage ? 'text-danger' : 'text-success'}>
              {overage
                ? t('fittings.compare.overBy', {
                    resource: t(`fittings.list.${overage.resource}`),
                    amount: overage.amount.toFixed(0),
                  })
                : t('fittings.compare.fitsYes')}
            </span>
          )}
          {flies !== null && flies !== undefined && (
            <span className={flies ? 'text-success' : 'text-danger'}>
              {flies ? t('fittings.compare.canFlyYes') : t('fittings.compare.canFlyNo')}
            </span>
          )}
          {canFly.failed[index] && (
            <span className="text-text-dim">{t('fittings.compare.canFlyUnknown')}</span>
          )}
          {slot.fitting && characterOptions.length > 1 && (
            <CompareCanFlyByCharacter fitting={slot.fitting} characters={characterOptions} />
          )}
          <div className="flex items-center gap-1">
            <RowMoreActions />
            <IconButton
              icon={<Icon.Close />}
              label={t('fittings.compare.remove')}
              onClick={() => removeSlot(index)}
            />
          </div>
        </div>
      </RowActionsMenu>
    );
  }

  const columns: FittingCompareColumn[] = visible.map((index) => ({
    index,
    statsIndex: statsPosition(index),
    header: headerFor(index),
  }));

  const differencesToggle = (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
      <Checkbox
        checked={showDifferencesOnly}
        disabled={count < 2}
        onChange={() => setDifferencesOnly((v) => !v)}
      />
      {t('fittings.compare.differencesOnly')}
    </label>
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title={t('fittings.compare.title')}
        actions={
          <Button
            variant="primary"
            disabled={count >= MAX_COMPARE_SLOTS}
            onClick={() => setPickerOpen(true)}
          >
            {t('fittings.compare.addFitting')}
          </Button>
        }
      />

      {/* One wrapping toolbar from `md` up (label + select stay adjacent per group); phones keep the stacked rows. */}
      <div
        data-testid="compare-controls"
        className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2"
      >
        <DamageProfilePicker damageProfiles={damageProfiles} />
        <AbyssalWeatherPicker />
        <TargetProfilePicker targetProfiles={targetProfiles} />
        {!isPhone && count > 0 && differencesToggle}
      </div>

      {count === 0 ? (
        <EmptyState
          title={t('fittings.compare.emptyTitle')}
          hint={t('fittings.compare.emptyHint')}
          action={
            <Button variant="primary" onClick={() => setPickerOpen(true)}>
              {t('fittings.compare.addFitting')}
            </Button>
          }
        />
      ) : (
        <>
          {isPhone && count > 2 && (
            <div className="flex items-center justify-between">
              <Button
                className="min-h-11 min-w-11"
                disabled={pageWindow.start === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('fittings.compare.pagePrev')}
              </Button>
              <Button
                className="min-h-11 min-w-11"
                disabled={pageWindow.end >= count}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('fittings.compare.pageNext')}
              </Button>
            </div>
          )}

          {isPhone && differencesToggle}
          {!statsReady ? (
            <Panel title={t('fittings.compare.statsTitle')}>
              <p className={profileFailed ? 'text-xs text-danger' : 'text-xs text-text-dim'}>
                {profileFailed
                  ? t('fittings.compare.profileFailed')
                  : anyError
                    ? t('fittings.compare.fixErrorsHint')
                    : anyStatsFailed
                      ? t('fittings.compare.statsFailedHint')
                      : t('fittings.stats.loadingIndeterminate')}
              </p>
              {profileFailed && (
                <Button className="mt-2" onClick={retryProfile}>
                  {t('fittings.compare.profileRetry')}
                </Button>
              )}
            </Panel>
          ) : (
            <>
              <Panel title={t('fittings.compare.statsTitle')}>
                <FittingCompareTable
                  rows={table!.rows}
                  columns={columns}
                  differencesOnly={showDifferencesOnly}
                />
                {!pricesReady && (
                  <p className="mt-2 text-xs text-text-dim">
                    {anyPriceFailed
                      ? t('fittings.compare.priceFailed')
                      : t('fittings.compare.priceLoading')}
                  </p>
                )}
                <p className="mt-2 text-xs text-text-dim">{t('fittings.appliedDps.assumptions')}</p>
              </Panel>
              {okSlots.length >= 2 && (
                <Panel title={t('fittings.compare.modulesTitle')}>
                  <FittingCompareModulesSummary entries={moduleDiffs} columns={columns} />
                </Panel>
              )}
            </>
          )}
        </>
      )}

      <FittingComparePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        characterId={activeCharacterId}
        onAdd={addCode}
      />
    </div>
  );
}

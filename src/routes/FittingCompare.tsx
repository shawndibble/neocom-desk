import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, IconButton, PageHeader, Panel, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  compareFittingStats,
  compareWindow,
  modulesThatDiffer,
} from '@/engine/fittings/fittingCompare';
import type { FittingStats } from '@/engine/fittings/types';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useIsPhone } from '@/lib/useIsPhone';
import { useCompareCodes, MAX_COMPARE_SLOTS } from '@/features/fittings/compareUrl';
import { FittingComparePicker } from '@/features/fittings/FittingComparePicker';
import { FittingCompareModulesSummary } from '@/features/fittings/FittingCompareModulesSummary';
import {
  FittingCompareTable,
  type FittingCompareColumn,
} from '@/features/fittings/FittingCompareTable';
import { useCompareCanFly } from '@/features/fittings/useCompareCanFly';
import { useCompareFittings } from '@/features/fittings/useCompareFittings';
import { useCompareStats } from '@/features/fittings/useCompareStats';
import { usePilotProfile } from '@/features/fittings/fittingPilotProfile';

/**
 * Fitting vs Fitting compare: up to three Fittings, entirely in the URL
 * (`?f=…&f=…&f=…`) — copying the address bar reproduces the same comparison.
 * Phone shows two columns at a time with paging.
 */
export function FittingCompare() {
  const { t } = useTranslation();
  const [codes, setCodes] = useCompareCodes();
  const slots = useCompareFittings(codes);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const profile = usePilotProfile(activeCharacterId);
  const fittings = useMemo(() => slots.map((slot) => slot?.fitting ?? null), [slots]);
  const stats = useCompareStats(fittings, profile);
  const canFly = useCompareCanFly(fittings, profile).values;
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
  const validFittings = fittings.filter((f) => f !== null);
  const statsReady =
    count > 0 &&
    !anyError &&
    slots.every((slot) => slot !== null) &&
    stats.values.every((s) => s !== null);
  // One Fitting has nothing to differ from, so show all its stats rather than an empty table.
  const showDifferencesOnly = differencesOnly && count >= 2;

  const table = useMemo(
    () => (statsReady ? compareFittingStats(stats.values as readonly FittingStats[]) : null),
    [statsReady, stats.values]
  );
  const moduleDiffs = useMemo(
    () => (statsReady ? modulesThatDiffer(validFittings) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `validFittings` is a fresh array every render; `fittings` (from the memoized `slots`) is its stable underlying identity.
    [statsReady, fittings]
  );

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
    const flies = canFly[index];
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="max-w-40 truncate font-medium text-text">{slot.fitting?.name}</span>
        {stats.failed[index] && (
          <span className="text-danger">{t('fittings.compare.statsFailed')}</span>
        )}
        {flies !== null && flies !== undefined && (
          <span className={flies ? 'text-success' : 'text-danger'}>
            {flies ? t('fittings.compare.canFlyYes') : t('fittings.compare.canFlyNo')}
          </span>
        )}
        <IconButton
          icon={<Icon.Close />}
          label={t('fittings.compare.remove')}
          onClick={() => removeSlot(index)}
        />
      </div>
    );
  }

  const columns: FittingCompareColumn[] = visible.map((index) => ({
    index,
    header: headerFor(index),
  }));

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

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold md:min-h-0">
            <input
              type="checkbox"
              checked={showDifferencesOnly}
              disabled={count < 2}
              onChange={() => setDifferencesOnly((v) => !v)}
              className="size-4 shrink-0 cursor-pointer accent-accent disabled:opacity-50"
            />
            {t('fittings.compare.differencesOnly')}
          </label>

          {!statsReady ? (
            <Panel title={t('fittings.compare.statsTitle')}>
              <p className="text-xs text-text-dim">
                {anyError
                  ? t('fittings.compare.fixErrorsHint')
                  : anyStatsFailed
                    ? t('fittings.compare.statsFailedHint')
                    : t('fittings.stats.loadingIndeterminate')}
              </p>
            </Panel>
          ) : (
            <>
              <Panel title={t('fittings.compare.statsTitle')}>
                <FittingCompareTable
                  rows={table!.rows}
                  columns={columns}
                  differencesOnly={showDifferencesOnly}
                />
              </Panel>
              <Panel title={t('fittings.compare.modulesTitle')}>
                <FittingCompareModulesSummary entries={moduleDiffs} visible={visible} />
              </Panel>
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

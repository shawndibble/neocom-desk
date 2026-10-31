import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { IskDelta, Panel, SegmentedControl, Spinner, StatChip, StatChips } from '@/components/ui';
import { classifyJournal, type JournalRow } from '@/engine/journalNetting';
import { utcDay } from '@/engine/localDay';
import { useNow } from '@/lib/useNow';
import { cashFlow, type CashFlowDays } from '@/engine/netWorth/cashFlow';
import {
  loadAllCharactersJournals,
  type AllJournalsSnapshot,
} from '@/features/character/walletJournalAll';
import type { FanOutCharacter } from '@/features/character/allCharactersFanOut';
import { JOURNAL_FIELD_TO_PARAM } from '@/features/character/walletJournalFilter';
import { IskFlowLegend } from '@/features/character/IskFlowLegend';
import { formatIsk } from '@/lib/isk';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';

const LazyIskFlowChartBars = lazy(() =>
  guarded(() => import('@/features/character/IskFlowChartBars'))
);

const PERIOD_VALUES = ['7', '30', '90'] as const;

interface CashFlowPanelProps {
  characters: readonly FanOutCharacter[];
}

/**
 * Balance's Cash flow: ISK earned and spent over 7, 30 or 90 days with the
 * Journal's own daily bars. A day on the bars opens the Journal on that day.
 * The Journal tab keeps the by-source breakdown.
 */
export function CashFlowPanel({ characters }: CashFlowPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const touch = useMediaQuery(COARSE_POINTER_QUERY);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const today = utcDay(useNow());
  const [snapshot, setSnapshot] = useState<AllJournalsSnapshot | null>(null);

  const key = characters.map((c) => c.characterId).join(',');
  useEffect(() => {
    let cancelled = false;
    void loadAllCharactersJournals(characters, { typeNames: false, fills: false })
      .then((loaded) => {
        if (!cancelled) setSnapshot(loaded);
      })
      .catch(() => {
        if (!cancelled) setSnapshot({ loaded: [], skipped: [], typeNames: new Map() });
      });
    return () => {
      cancelled = true;
    };
    // `key` stands for `characters`: a new array of the same Characters must not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const rows = useMemo<JournalRow[]>(() => {
    if (!snapshot) return [];
    const trackedIds = new Set(snapshot.loaded.map((entry) => entry.characterId));
    return classifyJournal(
      snapshot.loaded.flatMap((entry) =>
        entry.journal.map((line) => ({ ...line, characterId: entry.characterId }))
      ),
      { trackedIds, linkFor: () => undefined }
    );
  }, [snapshot]);
  const flow = useMemo(
    () => cashFlow(rows, Number(period) as CashFlowDays, today),
    [rows, period, today]
  );

  if (snapshot === null) {
    return (
      <Panel title={t('wallet.cashFlow.title')}>
        <Spinner block="panel" label={t('common.loading')} />
      </Panel>
    );
  }
  if (snapshot.loaded.length === 0) return null;

  const delta =
    flow.earnedBefore !== null && flow.earnedBefore > 0
      ? Math.round(((flow.earned - flow.earnedBefore) / flow.earnedBefore) * 100)
      : null;
  const deltaText =
    delta === null ? '' : delta > 999 ? '>+999%' : `${delta > 0 ? '+' : ''}${delta}%`;
  const truncated = snapshot.loaded.some((entry) => entry.truncated);

  return (
    <Panel
      title={t('wallet.cashFlow.title')}
      actions={
        <SegmentedControl
          label={t('wallet.cashFlow.period')}
          options={PERIOD_VALUES.map((value) => ({
            value,
            label: t('wallet.cashFlow.periodDays', { count: Number(value) }),
          }))}
          value={period}
          onChange={setPeriod}
          size="sm"
          uppercase={false}
        />
      }
    >
      <StatChips>
        <StatChip label={t('wallet.cashFlow.earned')} value={formatIsk(flow.earned)} />
        <StatChip label={t('wallet.cashFlow.spent')} value={formatIsk(flow.spent)} />
        <StatChip
          label={t('wallet.cashFlow.net')}
          value={<IskDelta amount={flow.net} decimals={0} />}
          emphasis
        />
        <StatChip label={t('wallet.cashFlow.perDay')} value={formatIsk(Math.round(flow.perDay))} />
      </StatChips>
      {delta !== null && (
        <p className="mt-2 text-xs text-text-dim">
          {t('wallet.cashFlow.versusBefore', {
            change: deltaText,
            days: period,
            amount: formatIsk(flow.earnedBefore ?? 0),
          })}
        </p>
      )}
      <div className="mt-4">
        <Suspense
          fallback={
            <div className="flex h-40 items-center justify-center">
              <Spinner label={t('common.loading')} />
            </div>
          }
        >
          <LazyIskFlowChartBars
            days={flow.days}
            selectedDay={null}
            readOnly={touch}
            onSelectDay={(day) => {
              const found = flow.days.find((d) => d.day === day);
              if (!found || (found.in === 0 && found.out === 0)) return;
              const params = new URLSearchParams({
                [JOURNAL_FIELD_TO_PARAM.startDate]: day,
                [JOURNAL_FIELD_TO_PARAM.endDate]: day,
              });
              navigate(`/wallet/journal?${params}`);
            }}
          />
        </Suspense>
      </div>
      <div className="mt-2">
        <IskFlowLegend>{!touch && <span>{t('wallet.cashFlow.clickHint')}</span>}</IskFlowLegend>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-text-dim">
        <span>
          {flow.partial && flow.coveredFrom
            ? t('wallet.cashFlow.partial', { day: flow.coveredFrom })
            : t('wallet.cashFlow.lagNote')}
          {truncated && ` ${t('wallet.journalTruncatedHint')}`}
          {snapshot.skipped.length > 0 &&
            ` ${t('wallet.cashFlow.skipped', { count: snapshot.skipped.length })}`}
        </span>
      </p>
    </Panel>
  );
}

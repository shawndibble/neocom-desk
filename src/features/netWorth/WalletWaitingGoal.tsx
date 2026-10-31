import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Eyebrow,
  IskDelta,
  IskInput,
  Modal,
  Panel,
  ProgressBar,
  TextInput,
  textActionClassName,
} from '@/components/ui';
import { goalProgress, iskWaiting, walletChange } from '@/engine/netWorth/waiting';
import { utcDay } from '@/engine/netWorth/snapshot';
import { formatIsk, parseIskAmount } from '@/lib/isk';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useNetWorthData } from './useNetWorthData';
import { useWalletGoal } from './walletGoalSetting';

interface WalletWaitingGoalProps {
  characterIds: readonly number[];
}

/**
 * Under the net worth chart: ISK parked in orders and contracts, and one wallet
 * Goal. Both read the stored Net Worth Snapshots, so they cost no ESI read.
 */
export function WalletWaitingGoal({ characterIds }: WalletWaitingGoalProps) {
  const { t, i18n } = useTranslation();
  const data = useNetWorthData(characterIds);
  const goal = useWalletGoal((s) => s.value);
  const setGoal = useWalletGoal((s) => s.setValue);
  useHydratedStore(useWalletGoal);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const rows = useMemo(
    () => characterIds.flatMap((id) => data.snapshotsByCharacter.get(id) ?? []),
    [characterIds, data.snapshotsByCharacter]
  );
  const [today] = useState(() => utcDay(Date.now()));
  const waiting = useMemo(() => iskWaiting(rows), [rows]);
  const change = useMemo(() => walletChange(rows, today), [rows, today]);
  const progress = useMemo(
    () => (goal ? goalProgress({ target: goal.target, rows, today }) : null),
    [goal, rows, today]
  );

  if (!data.ready || rows.length === 0) return null;

  const target = parseIskAmount(amount);
  const projected = progress?.projectedDay
    ? new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${progress.projectedDay}T00:00:00Z`))
    : null;
  const openEditor = () => {
    setName(goal?.name ?? '');
    setAmount(goal ? String(goal.target) : '');
    setEditing(true);
  };
  const save = () => {
    if (target === null || target <= 0) return;
    setGoal({ name: name.trim(), target });
    setEditing(false);
  };

  const waitingRows = [
    ['sellOrders', waiting.sellOrders],
    ['escrow', waiting.escrow],
    ['contracts', waiting.contracts],
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t('wallet.waiting.title')}>
        <ul className="divide-y divide-line text-sm">
          {waitingRows.map(([key, isk]) => (
            <li key={key} className="flex justify-between py-2">
              <span>{t(`wallet.waiting.${key}`)}</span>
              <span className="tabular-nums">{formatIsk(isk)} ISK</span>
            </li>
          ))}
        </ul>
        {change !== null && (
          <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-text-dim">
              {t('wallet.waiting.change')} <IskDelta amount={change} decimals={0} /> ISK
            </span>
            <Link to="/wallet/journal" className={textActionClassName()}>
              {t('wallet.waiting.openJournal')}
            </Link>
          </p>
        )}
      </Panel>
      <Panel
        title={
          goal?.name ? t('wallet.goal.titleNamed', { name: goal.name }) : t('wallet.goal.title')
        }
        actions={
          <Button size="sm" variant="ghost" onClick={openEditor}>
            {goal ? t('wallet.goal.edit') : t('wallet.goal.set')}
          </Button>
        }
      >
        {progress && goal ? (
          <>
            <Eyebrow>{t('wallet.goal.walletIsk')}</Eyebrow>
            <p className="tabular-nums">
              {t('wallet.goal.progress', {
                current: formatIsk(progress.current),
                target: formatIsk(progress.target),
              })}
            </p>
            <ProgressBar
              label={t('wallet.goal.progressLabel')}
              value={progress.fraction * 100}
              size="md"
              className="mt-2"
            />
            <p className="mt-2 text-sm text-text-dim">
              {progress.reached
                ? t('wallet.goal.reached')
                : projected && progress.perDay !== null
                  ? t('wallet.goal.pace', {
                      perDay: formatIsk(Math.round(progress.perDay)),
                      date: projected,
                    })
                  : t('wallet.goal.noPace')}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-dim">{t('wallet.goal.empty')}</p>
        )}
      </Panel>
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={t('wallet.goal.dialogTitle')}
        footer={
          <>
            {goal && (
              <Button
                variant="ghost"
                onClick={() => {
                  setGoal(null);
                  setEditing(false);
                }}
              >
                {t('wallet.goal.remove')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={save} disabled={target === null || target <= 0}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            {t('wallet.goal.nameLabel')}
            <TextInput
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm">
            {t('wallet.goal.targetLabel')}
            <IskInput value={amount} onChange={setAmount} className="mt-1 w-full" />
          </label>
        </div>
      </Modal>
    </div>
  );
}

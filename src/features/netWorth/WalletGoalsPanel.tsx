import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IskAmount,
  IskInput,
  Modal,
  NativeSelect,
  Panel,
  ProgressBar,
  TextInput,
} from '@/components/ui';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { GOAL_MAX_TARGET, goalProgress } from '@/engine/netWorth/waiting';
import { useFittingChoices } from '@/features/fittings/useFittingChoices';
import { parseIskAmount } from '@/lib/isk';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useGoalPrices } from './useGoalPrices';
import { useWalletGoals, type WalletGoal } from './walletGoalSetting';

interface WalletGoalsPanelProps {
  rows: readonly NetWorthSnapshotRow[];
  today: string;
}

/** A Goal being added (`id` null) or edited. */
interface Draft {
  id: string | null;
  name: string;
  amount: string;
  fittingId: string;
}

const NEW_DRAFT: Draft = { id: null, name: '', amount: '', fittingId: '' };

/**
 * The wallet Goals: each a name and a target, either typed or the price of a
 * Fitting at the default Trade Hub, with progress against the summed wallet
 * ISK and the pace and date from the last 30 days of snapshots.
 */
export function WalletGoalsPanel({ rows, today }: WalletGoalsPanelProps) {
  const { t, i18n } = useTranslation();
  const goals = useWalletGoals((s) => s.value);
  const setGoals = useWalletGoals((s) => s.setValue);
  useHydratedStore(useWalletGoals);
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const choices = useFittingChoices(characterId);
  const prices = useGoalPrices(goals, choices.resolve, choices.ready);
  const [draft, setDraft] = useState<Draft | null>(null);

  const formatDay = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));

  const amount = draft ? parseIskAmount(draft.amount) : null;
  const typed = draft !== null && draft.amount.trim() !== '';
  const amountOk = amount !== null && amount > 0 && amount <= GOAL_MAX_TARGET;
  const canSave = draft !== null && (typed ? amountOk : draft.fittingId !== '');

  const save = () => {
    if (!draft || !canSave) return;
    const picked = choices.all.find((choice) => choice.id === draft.fittingId);
    const goal: WalletGoal = {
      id: draft.id ?? `goal-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      target: typed ? amount : null,
      fittingId: typed ? null : draft.fittingId,
      fittingName: typed ? null : (picked?.name ?? null),
    };
    setGoals(
      draft.id === null ? [...goals, goal] : goals.map((g) => (g.id === goal.id ? goal : g))
    );
    setDraft(null);
  };

  const edit = (goal: WalletGoal) =>
    setDraft({
      id: goal.id,
      name: goal.name,
      amount: goal.target === null ? '' : String(goal.target),
      fittingId: goal.fittingId ?? '',
    });

  return (
    <Panel
      title={t('wallet.goal.title')}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setDraft(NEW_DRAFT)}>
          {t('wallet.goal.add')}
        </Button>
      }
    >
      {goals.length === 0 ? (
        <p className="text-sm text-text-dim">{t('wallet.goal.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              rows={rows}
              today={today}
              price={prices.get(goal.id)}
              formatDay={formatDay}
              onEdit={() => edit(goal)}
            />
          ))}
        </ul>
      )}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id === null ? t('wallet.goal.dialogTitleNew') : t('wallet.goal.dialogTitle')}
        footer={
          <>
            {draft?.id != null && (
              <Button
                variant="ghost"
                onClick={() => {
                  setGoals(goals.filter((g) => g.id !== draft.id));
                  setDraft(null);
                }}
              >
                {t('wallet.goal.remove')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={save} disabled={!canSave}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <label className="block text-sm">
              {t('wallet.goal.nameLabel')}
              <TextInput
                value={draft.name}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              {t('wallet.goal.targetLabel')}
              <IskInput
                mask
                value={draft.amount}
                onChange={(amountText) => setDraft({ ...draft, amount: amountText })}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              {t('wallet.goal.fittingLabel')}
              <NativeSelect
                value={draft.fittingId}
                disabled={typed || choices.all.length === 0}
                onChange={(e) => setDraft({ ...draft, fittingId: e.target.value })}
                className="mt-1 w-full"
              >
                <option value="">{t('wallet.goal.fittingNone')}</option>
                {choices.all.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <p className="-mt-1 text-xs text-text-dim">
              {typed ? t('wallet.goal.fittingNeedsBlank') : t('wallet.goal.fittingHint')}
            </p>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

interface GoalRowProps {
  goal: WalletGoal;
  rows: readonly NetWorthSnapshotRow[];
  today: string;
  price: ReturnType<typeof useGoalPrices> extends ReadonlyMap<string, infer P>
    ? P | undefined
    : never;
  formatDay: (day: string) => string;
  onEdit: () => void;
}

function GoalRow({ goal, rows, today, price, formatDay, onEdit }: GoalRowProps) {
  const { t } = useTranslation();
  const target = goal.target ?? (price?.status === 'ready' ? price.sell : null);
  const progress = useMemo(
    () => (target === null ? null : goalProgress({ target, rows, today })),
    [target, rows, today]
  );
  const title = goal.name || goal.fittingName || t('wallet.goal.untitled');

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-medium">{title}</p>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t('wallet.goal.edit')}
        </Button>
      </div>
      {progress ? (
        <>
          <p className="text-sm tabular-nums">
            <IskAmount value={progress.current} decimals={0} /> /{' '}
            <IskAmount value={progress.target} decimals={0} />
            {goal.fittingId !== null && (
              <span className="text-text-dim">
                {' '}
                {t('wallet.goal.pricedFrom', { name: goal.fittingName ?? title })}
              </span>
            )}
          </p>
          <ProgressBar
            label={t('wallet.goal.progressLabel', { name: title })}
            value={progress.fraction * 100}
            size="md"
          />
          <p className="flex flex-wrap justify-between gap-x-4 text-sm text-text-dim">
            {progress.reached ? (
              <span>{t('wallet.goal.reached')}</span>
            ) : progress.perDay !== null && progress.projectedDay ? (
              <>
                <span className="tabular-nums">
                  {t('wallet.goal.avg')} <IskAmount value={progress.perDay} decimals={0} />{' '}
                  {t('wallet.goal.iskUnit')}
                </span>
                <span>{t('wallet.goal.eta', { date: formatDay(progress.projectedDay) })}</span>
              </>
            ) : (
              <span>{t('wallet.goal.noPace')}</span>
            )}
          </p>
        </>
      ) : (
        <p className="text-sm text-text-dim">
          {price?.status === 'failed' ? t('wallet.goal.priceFailed') : t('wallet.goal.pricing')}
        </p>
      )}
    </li>
  );
}

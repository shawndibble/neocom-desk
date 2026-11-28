import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  Button,
  entityLinkClassName,
  Field,
  Fields,
  IskAmount,
  IskInput,
  Modal,
  Panel,
  ProgressBar,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  ToastStack,
  useDeferredCommits,
} from '@/components/ui';
import { formatDateWithYear } from '@/lib/formatDateTick';
import type { NetWorthSnapshotRow } from '@/engine/netWorth/snapshot';
import { GOAL_MAX_TARGET, goalProgress } from '@/engine/netWorth/waiting';
import type { FittingEditLocation } from '@/features/fittings/fittingRoutes';
import { useFittingChoices } from '@/features/fittings/useFittingChoices';
import { useMarketHub } from '@/features/market/hub';
import { parseIskAmount } from '@/lib/isk';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { goalPriceKey, useGoalPrices, type GoalPrice } from './useGoalPrices';
import { useWalletGoals, type WalletGoal } from './walletGoalSetting';

interface WalletGoalsPanelProps {
  rows: readonly NetWorthSnapshotRow[];
  today: string;
}

interface Draft {
  id: string | null;
  name: string;
  mode: 'amount' | 'fitting';
  amount: string;
  fittingId: string;
}

const NEW_DRAFT: Draft = { id: null, name: '', mode: 'amount', amount: '', fittingId: '' };

export function WalletGoalsPanel({ rows, today }: WalletGoalsPanelProps) {
  const { t } = useTranslation();
  const goals = useWalletGoals((s) => s.value);
  const setGoals = useWalletGoals((s) => s.setValue);
  useHydratedStore(useWalletGoals);
  const characterId = useActiveCharacter((s) => s.activeCharacterId);
  const choices = useFittingChoices(characterId);
  const hub = getTradeHub(useMarketHub((s) => s.value)) ?? DEFAULT_TRADE_HUB;
  const { prices, links } = useGoalPrices(goals, hub, choices.resolve, choices.ready);
  const [draft, setDraft] = useState<Draft | null>(null);
  const pendingRemovals = useDeferredCommits();
  const shownGoals = pendingRemovals.visible(goals);

  const remove = () => {
    const goal = goals.find((g) => g.id === draft?.id);
    setDraft(null);
    if (!goal) return;
    const { id } = goal;
    pendingRemovals.defer({
      id,
      message: t('wallet.goal.removed', {
        name: goal.name || goal.fittingName || t('wallet.goal.untitled'),
      }),
      commit: () => setGoals(useWalletGoals.getState().value.filter((g) => g.id !== id)),
    });
  };

  const amount = draft ? parseIskAmount(draft.amount) : null;
  const amountOk = amount !== null && amount > 0 && amount <= GOAL_MAX_TARGET;
  const byFitting = draft?.mode === 'fitting';
  const canSave = draft !== null && (byFitting ? draft.fittingId !== '' : amountOk);
  const saveReasonId = useId();
  const saveBlockedReason = canSave
    ? null
    : byFitting
      ? t('wallet.goal.needsFitting')
      : t('wallet.goal.needsAmount');

  const save = () => {
    if (!draft || !canSave) return;
    const picked = choices.all.find((choice) => choice.id === draft.fittingId);
    const kept = goals.find((g) => g.id === draft.id && g.fittingId === draft.fittingId);
    const goal: WalletGoal = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      target: byFitting ? null : amount,
      fittingId: byFitting ? draft.fittingId : null,
      fittingName: byFitting ? (picked?.name ?? kept?.fittingName ?? null) : null,
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
      mode: goal.fittingId === null ? 'amount' : 'fitting',
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
      {shownGoals.length === 0 ? (
        <p className="text-sm text-text-dim">{t('wallet.goal.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {shownGoals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              rows={rows}
              today={today}
              hubName={hub.name}
              price={prices.get(goalPriceKey(goal))}
              fittingLink={links.get(goalPriceKey(goal))}
              formatDay={formatDateWithYear}
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
              <Button variant="danger" className="mr-auto" onClick={remove}>
                {t('wallet.goal.remove')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            {draft && saveBlockedReason !== null && (
              <span id={saveReasonId} className="text-[0.6875rem] text-text-dim">
                {saveBlockedReason}
              </span>
            )}
            <Button
              variant="primary"
              onClick={save}
              aria-disabled={!canSave || undefined}
              aria-describedby={saveBlockedReason !== null ? saveReasonId : undefined}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        {draft && (
          <Fields variant="form">
            <Field label={t('wallet.goal.nameLabel')} htmlFor="goal-name">
              <TextInput
                id="goal-name"
                value={draft.name}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full"
              />
            </Field>
            <Field label={t('wallet.goal.targetLabel')}>
              <SegmentedControl
                label={t('wallet.goal.targetLabel')}
                options={[
                  { value: 'amount', label: t('wallet.goal.modeAmount') },
                  { value: 'fitting', label: t('wallet.goal.modeFitting') },
                ]}
                value={draft.mode}
                onChange={(mode) => setDraft({ ...draft, mode })}
                uppercase={false}
              />
            </Field>
            {byFitting ? (
              <Field
                label={t('wallet.goal.fittingLabel')}
                note={
                  choices.all.length === 0
                    ? t('wallet.goal.noFittings')
                    : t('wallet.goal.fittingHint', { hub: hub.name })
                }
              >
                <Select
                  value={draft.fittingId}
                  disabled={choices.all.length === 0}
                  onValueChange={(fittingId) => setDraft({ ...draft, fittingId })}
                >
                  <SelectTrigger aria-label={t('wallet.goal.fittingLabel')} className="w-full">
                    <SelectValue placeholder={t('wallet.goal.fittingPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.all.map((choice) => (
                      <SelectItem key={choice.id} value={choice.id}>
                        {choice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label={t('wallet.goal.amountLabel')} htmlFor="goal-amount">
                <IskInput
                  id="goal-amount"
                  value={draft.amount}
                  onChange={(amountText) => setDraft({ ...draft, amount: amountText })}
                  className="w-full"
                />
              </Field>
            )}
          </Fields>
        )}
      </Modal>
      <ToastStack {...pendingRemovals.toast} />
    </Panel>
  );
}

interface GoalRowProps {
  goal: WalletGoal;
  rows: readonly NetWorthSnapshotRow[];
  today: string;
  hubName: string;
  price: GoalPrice | undefined;
  fittingLink: FittingEditLocation | undefined;
  formatDay: (day: string) => string;
  onEdit: () => void;
}

function GoalRow({
  goal,
  rows,
  today,
  hubName,
  price,
  fittingLink,
  formatDay,
  onEdit,
}: GoalRowProps) {
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
        {fittingLink ? (
          <Link to={fittingLink} className={entityLinkClassName('min-w-0 truncate font-medium')}>
            {title}
          </Link>
        ) : (
          <p className="min-w-0 truncate font-medium">{title}</p>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('wallet.goal.editNamed', { name: title })}
          onClick={onEdit}
        >
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
                {t('wallet.goal.pricedFrom', { name: goal.fittingName ?? title, hub: hubName })}
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
                  <Trans
                    i18nKey="wallet.goal.avg"
                    components={{ amount: <IskAmount value={progress.perDay} decimals={0} /> }}
                  />
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
          {price?.status === 'failed'
            ? t('wallet.goal.priceFailed')
            : price?.status === 'partial'
              ? t('wallet.goal.pricePartial')
              : t('wallet.goal.pricing')}
        </p>
      )}
    </li>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Eyebrow, Panel } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { VettingState, VettingStatus } from '@/engine/vetting';
import { formatList } from '@/lib/listFormat';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { VettingSteps } from './VettingPublicFrame';
import { deletionLine } from './vettingText';

const STATE_TONE: Partial<Record<VettingState, PillTone>> = { accepted: 'success' };

/** Who opened the report and when it is deleted: the pilot sees the same list the reviewers do. */
function VettingOpenedBy({ status }: { status: VettingStatus }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const byName = new Map<string, number[]>();
  for (const entry of status.openedBy) {
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry.at]);
  }
  return (
    <dl className="space-y-1.5">
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <dt className="text-text-dim">{t('vetting.status.openedBy')}</dt>
        <dd className="space-y-1">
          {byName.size === 0
            ? t('vetting.status.nobodyYet')
            : [...byName].map(([name, times]) => (
                <span key={name} className="block">
                  {name}
                  <span className="block text-xs text-text-dim tabular-nums">
                    {formatList(
                      times
                        .toSorted((a, b) => a - b)
                        .map((at) => formatTimestamp(new Date(at), timeZone))
                    )}
                  </span>
                </span>
              ))}
        </dd>
      </div>
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <dt className="text-text-dim">{t('vetting.status.deleted')}</dt>
        <dd>{deletionLine(status, (at) => formatDateOnly(new Date(at), timeZone), t)}</dd>
      </div>
    </dl>
  );
}

interface VettingStatusViewProps {
  status: VettingStatus;
  /** Withdraws and deletes the report; rejects to keep the confirm open. Absent hides the action. */
  onWithdraw?: () => Promise<void>;
  /** The optional offer to sign in to the app; absent for a pilot who already uses it. */
  onOpenApp?: () => void;
}

/**
 * A pilot's review after it is sent: where Send lands and what they come back to. Status, what
 * happens next, who opened the report, when it is deleted, Withdraw.
 */
export function VettingStatusView({ status, onWithdraw, onOpenApp }: VettingStatusViewProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [confirming, setConfirming] = useState(false);
  const decidedAt =
    status.decidedAt !== null ? formatTimestamp(new Date(status.decidedAt), timeZone) : '';
  const corp = status.corporationName;
  const steps: string[] =
    status.state === 'open'
      ? [
          t(`vetting.status.next.open.${status.kind}`),
          t('vetting.status.next.contact'),
          t(`vetting.status.next.outcome.${status.kind}`),
        ]
      : status.state === 'accepted'
        ? status.kind === 'application'
          ? [t('vetting.status.next.join', { corp }), t('vetting.status.next.joinAccept')]
          : [t('vetting.status.next.role')]
        : [];
  const gone = status.state === 'withdrawn' || status.state === 'declined';
  return (
    <>
      <Panel
        title={t(`vetting.status.title.${status.kind}`)}
        meta={
          <Pill tone={STATE_TONE[status.state] ?? 'neutral'}>
            {t(`vetting.status.state.${status.state}`)}
          </Pill>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            {status.state === 'open'
              ? t(`vetting.status.line.open.${status.kind}`, { count: status.characters.length })
              : t(`vetting.status.line.${status.state}`, { when: decidedAt, corp })}
          </p>
          {steps.length > 0 && (
            <div className="space-y-2">
              <Eyebrow>{t('vetting.status.nextTitle')}</Eyebrow>
              <VettingSteps steps={steps} />
            </div>
          )}
        </div>
      </Panel>
      {!gone && (
        <Panel title={t('vetting.status.reportTitle')}>
          <div className="space-y-3 text-sm">
            <VettingOpenedBy status={status} />
            <p className="text-text-dim">{t('vetting.status.nothingKept')}</p>
            {onWithdraw && (
              <Button size="sm" onClick={() => setConfirming(true)}>
                {t(
                  status.state === 'open' ? 'vetting.status.withdraw' : 'vetting.status.deleteNow'
                )}
              </Button>
            )}
          </div>
        </Panel>
      )}
      {onOpenApp && (
        <Panel title={t('vetting.status.useApp.title')}>
          <div className="space-y-3 text-sm">
            <p>{t('vetting.status.useApp.body')}</p>
            <p className="text-text-dim">{t('vetting.status.useApp.note')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onOpenApp}>{t('vetting.status.useApp.action')}</Button>
              <span className="text-xs text-text-dim">{t('vetting.status.useApp.or')}</span>
            </div>
          </div>
        </Panel>
      )}
      {onWithdraw && (
        <ConfirmDialog
          open={confirming}
          title={t(
            status.state === 'open'
              ? 'vetting.status.withdrawConfirm.title'
              : 'vetting.status.withdrawConfirm.titleDecided'
          )}
          body={t('vetting.status.withdrawConfirm.body', { corp })}
          actionLabel={t('vetting.status.withdrawConfirm.action')}
          cancelLabel={t('common.cancel')}
          failedLabel={t('vetting.errors.generic')}
          onConfirm={onWithdraw}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

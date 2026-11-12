import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CharacterAvatar, Modal, ProgressBar } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import {
  current,
  currentAlerts,
  progress,
  type AddCorpsCandidate,
  type AddCorpsRun,
} from '@/engine/corpTaxBook/addCorpsRun';
import { addCorpsErrorText } from '../addCorpsErrorText';
import { stateOfOutcome } from './addCorpsStatus';
import { CorpRow, CorpStatePill } from './CorpRow';

const NOTE_TONE = {
  danger: 'border-danger/40 text-danger',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
} as const;

/** One outcome line above the log-in card: what the last return from EVE did. */
function OutcomeNote({ tone, children }: { tone: keyof typeof NOTE_TONE; children: ReactNode }) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-xs border p-2 ${NOTE_TONE[tone]}`}
    >
      {children}
    </p>
  );
}

const k = (key: string) => `corpTaxBook.moons.addCorps.signIn.${key}`;

/** The character to pick on EVE's login page. */
function CeoCard({ corp }: { corp: AddCorpsCandidate }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-xs border border-accent/40 bg-panel p-3">
      <CharacterAvatar characterId={corp.ceoCharacterId} size="lg" alt={corp.ceoName} />
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-text-dim uppercase">{t(k('choose'))}</p>
        <p className="truncate text-lg font-semibold">{corp.ceoName}</p>
        <p className="truncate text-text-dim">{t(k('ceoOf'), { name: corp.name })}</p>
      </div>
    </div>
  );
}

/** A settled promise means the login never left the page: show the failure line. */
function useLeave(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = () => {
    setBusy(true);
    setFailed(false);
    action()
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };
  return { busy, failed, go };
}

/**
 * Step 3: the guided sign-in sequence, one corporation at a time. The run lives
 * in the browser, so EVE's redirect back reopens this dialog on the next corp
 * (or on the same one after a wrong character).
 */
export function SignInSequenceDialog({
  run,
  showOutcome,
  onSignIn,
  onApproveAlerts,
  onSkipAlerts,
  onStop,
  onClose,
}: {
  run: AddCorpsRun;
  /** Show what happened on the last return from EVE (false when the player reopened it later). */
  showOutcome: boolean;
  /** Leaves for EVE's login as the current corporation's CEO. A rejection reads as an error line. */
  onSignIn: () => Promise<void>;
  /** Leaves for EVE to approve closed-app alerts as the CEO just connected (issue #6103). */
  onApproveAlerts?: () => Promise<void>;
  /** Moves past the alerts approval for this corp without it. */
  onSkipAlerts?: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const moon = useLeave(onSignIn);
  const alerts = useLeave(onApproveAlerts ?? (() => Promise.resolve()));
  const { done, total } = progress(run);
  const last = showOutcome ? run.lastOutcome : undefined;
  const lastCorp = last ? run.queue.find((c) => c.corporationId === last.corporationId) : undefined;
  const alertsCorp = currentAlerts(run);
  if (alertsCorp) {
    const n = run.queue.indexOf(alertsCorp) + 1;
    const wrongAs = run.alertsStep?.signedInAs;
    return (
      <Modal
        open
        onClose={onClose}
        placement="wide"
        title={t(k('alertsTitle'), { n, total })}
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button onClick={onStop}>{t(k('stop'))}</Button>
            <div className="flex gap-2">
              <Button onClick={onSkipAlerts}>{t(k('alertsSkip'))}</Button>
              <Button variant="primary" loading={alerts.busy} onClick={alerts.go}>
                {t(k('alertsAction'), { ceo: alertsCorp.ceoName })}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {alerts.failed && <OutcomeNote tone="danger">{t(k('failed'))}</OutcomeNote>}
          {wrongAs !== undefined ? (
            <OutcomeNote tone="danger">
              {t(k('alertsWrong'), { signedInAs: wrongAs, ceo: alertsCorp.ceoName })}
            </OutcomeNote>
          ) : (
            last?.outcome.kind === 'connected' &&
            lastCorp && (
              <OutcomeNote tone="success">
                {t(k('connectedLast'), { name: lastCorp.name })}
              </OutcomeNote>
            )
          )}
          <CeoCard corp={alertsCorp} />
          <p>{t(k('alertsWhy'), { ceo: alertsCorp.ceoName })}</p>
          <p className="text-xs text-text-dim">{t(k('alertsHint'), { ceo: alertsCorp.ceoName })}</p>
        </div>
      </Modal>
    );
  }
  const cur = current(run);
  if (!cur) return null;
  const lastAlerts =
    showOutcome && run.lastAlerts && run.lastAlerts.corporationId === last?.corporationId
      ? run.lastAlerts
      : undefined;
  const lastAlertsCeo = lastAlerts
    ? run.queue.find((c) => c.corporationId === lastAlerts.corporationId)?.ceoName
    : undefined;
  return (
    <Modal
      open
      onClose={onClose}
      placement="wide"
      title={t(k('title'), { n: run.index + 1, total })}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button onClick={onStop}>{t(k('stop'))}</Button>
          <Button variant="primary" loading={moon.busy} onClick={moon.go}>
            {t(k('action'), { ceo: cur.ceoName })}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {moon.failed && <OutcomeNote tone="danger">{t(k('failed'))}</OutcomeNote>}
        {last?.outcome.kind === 'connected' && lastCorp && (
          <OutcomeNote tone="success">
            {t(k('connected'), { name: lastCorp.name, next: cur.name })}
          </OutcomeNote>
        )}
        {last?.outcome.kind === 'wrong-character' && (
          <OutcomeNote tone="danger">
            {t(k('wrong'), {
              signedInAs: last.outcome.signedInAs,
              corp: cur.name,
              ceo: cur.ceoName,
            })}
          </OutcomeNote>
        )}
        {last &&
          lastCorp &&
          last.outcome.kind !== 'connected' &&
          last.outcome.kind !== 'wrong-character' && (
            <OutcomeNote tone="warning">
              {t(k('notConnected'), {
                name: lastCorp.name,
                reason:
                  last.outcome.kind === 'refused'
                    ? addCorpsErrorText(t, last.outcome.reason)
                    : t(k('cancelled')),
              })}
            </OutcomeNote>
          )}
        {lastAlerts && lastAlertsCeo && lastAlerts.kind !== 'skipped' && (
          <OutcomeNote tone={lastAlerts.kind === 'on' ? 'success' : 'warning'}>
            {t(k(lastAlerts.kind === 'on' ? 'alertsOn' : 'alertsNotOn'), { ceo: lastAlertsCeo })}
          </OutcomeNote>
        )}
        <ProgressBar label={t(k('progress'))} value={done} max={total} />
        <CeoCard corp={cur} />
        <p className="text-xs text-text-dim">{t(k('hint'), { ceo: cur.ceoName })}</p>
        <ul className="divide-y divide-line">
          {run.queue.map((c, i) => (
            <CorpRow
              key={c.corporationId}
              name={c.name}
              ceoName={c.ceoName}
              trailing={
                i === run.index ? (
                  <Pill tone="accent">{t(k('now'))}</Pill>
                ) : (
                  <CorpStatePill state={stateOfOutcome(run.outcomes[c.corporationId])} />
                )
              }
            />
          ))}
        </ul>
        <p className="text-xs text-text-dim">{t(k('footnote'))}</p>
      </div>
    </Modal>
  );
}

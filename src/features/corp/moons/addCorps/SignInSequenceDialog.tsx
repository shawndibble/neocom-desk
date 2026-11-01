import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CharacterAvatar, Modal, ProgressBar } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { current, progress, type AddCorpsRun } from '@/engine/corpTaxBook/addCorpsRun';
import { addCorpsErrorText } from '../addCorpsErrorText';
import { stateOfOutcome } from './addCorpsStatus';
import { CorpRow, CorpStatePill } from './CorpRow';

const k = (key: string) => `corpTaxBook.moons.addCorps.signIn.${key}`;

/**
 * Step 3: the guided sign-in sequence, one corporation at a time. The run lives
 * in the browser, so EVE's redirect back reopens this dialog on the next corp
 * (or on the same one after a wrong character).
 */
export function SignInSequenceDialog({
  run,
  showOutcome,
  onSignIn,
  onStop,
  onClose,
}: {
  run: AddCorpsRun;
  /** Show what happened on the last return from EVE (false when the player reopened it later). */
  showOutcome: boolean;
  /** Leaves for EVE's login as the current corporation's CEO. A rejection reads as an error line. */
  onSignIn: () => Promise<void>;
  onStop: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const cur = current(run);
  if (!cur) return null;
  const { done, total } = progress(run);
  const last = showOutcome ? run.lastOutcome : undefined;
  const lastCorp = last ? run.queue.find((c) => c.corporationId === last.corporationId) : undefined;
  const signIn = () => {
    setBusy(true);
    setFailed(false);
    onSignIn().catch(() => {
      setBusy(false);
      setFailed(true);
    });
  };
  return (
    <Modal
      open
      onClose={onClose}
      placement="wide"
      title={t(k('title'), { n: run.index + 1, total })}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button onClick={onStop}>{t(k('stop'))}</Button>
          <Button variant="primary" loading={busy} onClick={signIn}>
            {t(k('action'), { ceo: cur.ceoName })}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {failed && (
          <p role="alert" className="rounded-xs border border-danger/40 p-2 text-danger">
            {t(k('failed'))}
          </p>
        )}
        {last?.outcome.kind === 'connected' && lastCorp && (
          <p role="status" className="rounded-xs border border-success/40 p-2 text-success">
            {t(k('connected'), { name: lastCorp.name, next: cur.name })}
          </p>
        )}
        {last?.outcome.kind === 'wrong-character' && (
          <p role="alert" className="rounded-xs border border-danger/40 p-2 text-danger">
            {t(k('wrong'), {
              signedInAs: last.outcome.signedInAs,
              corp: cur.name,
              ceo: cur.ceoName,
            })}
          </p>
        )}
        {last &&
          lastCorp &&
          last.outcome.kind !== 'connected' &&
          last.outcome.kind !== 'wrong-character' && (
            <p role="status" className="rounded-xs border border-warning/40 p-2 text-warning">
              {t(k('notConnected'), {
                name: lastCorp.name,
                reason:
                  last.outcome.kind === 'refused'
                    ? addCorpsErrorText(t, last.outcome.reason)
                    : t(k('cancelled')),
              })}
            </p>
          )}
        <ProgressBar label={t(k('progress'))} value={done} max={total} />
        <div className="flex items-center gap-3 rounded-xs border border-accent/40 bg-panel p-3">
          <CharacterAvatar characterId={cur.ceoCharacterId} size="lg" alt={cur.ceoName} />
          <div className="min-w-0">
            <p className="text-xs tracking-wide text-text-dim uppercase">{t(k('choose'))}</p>
            <p className="truncate text-lg font-semibold">{cur.ceoName}</p>
            <p className="truncate text-text-dim">{t(k('ceoOf'), { name: cur.name })}</p>
          </div>
        </div>
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

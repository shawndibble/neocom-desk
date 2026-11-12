import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CharacterAvatar, Checkbox, Modal } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import {
  currentApproval,
  isFinished,
  type Approval,
  type FinishSetupChain,
} from '@/engine/character/finishSetup';
import { addCorpsErrorText } from '@/features/corp/moons/addCorpsErrorText';

const k = (key: string) => `characters.finishSetup.${key}`;

const NOTE_TONE = {
  danger: 'border-danger/40 text-danger',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
} as const;

function Note({ tone, children }: { tone: keyof typeof NOTE_TONE; children: ReactNode }) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-xs border p-2 ${NOTE_TONE[tone]}`}
    >
      {children}
    </p>
  );
}

/** One approval as the player reads it: what it is, and what it is for. */
function useApprovalText() {
  const { t, i18n } = useTranslation();
  const need = (key: string) => t(`settings.notifications.alertsWhenClosed.need.${key}`);
  return (item: Approval, name: string) => {
    if (item.kind === 'moon') {
      return {
        label: t(k('moon.label'), { corp: item.corporationName }),
        why: t(k('moon.why'), { corp: item.corporationName }),
      };
    }
    // What the grant reads, listed before Continue: that listing is the consent (ADR 0030).
    const reads = [
      need('notifications'),
      ...(item.nearby ? [need('location')] : []),
      ...(item.mail ? [need('mail')] : []),
    ];
    const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(reads);
    return {
      label: t(k('alerts.label')),
      why: `${t(k('alerts.why'), { name })} ${t(k('alerts.reads'), { list })}`,
    };
  };
}

/**
 * "Finish setting up {character}" (issue #6103): after a sign-in lands, the
 * Character's remaining approvals at EVE, ticked, with Continue and Not now;
 * then one item at a time across EVE's redirects; then a done screen offering
 * the next character. Presentational: the host owns the chain and the logins.
 */
export function FinishSetupDialog({
  chain,
  offering,
  onContinue,
  onApprove,
  onNotNow,
  onClose,
  onAddAnother,
}: {
  chain: FinishSetupChain;
  /** Before Continue: the list is ticked choices. After: the chain is running. */
  offering: boolean;
  /** Starts the chain and leaves for EVE for the first item. A rejection reads as an error line. */
  onContinue: (items: Approval[]) => Promise<void>;
  /** Leaves for EVE for the current item. A rejection reads as an error line. */
  onApprove: () => Promise<void>;
  onNotNow: () => void;
  onClose: () => void;
  onAddAnother: () => void;
}) {
  const { t } = useTranslation();
  const text = useApprovalText();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(chain.items.map((i) => i.kind))
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const leaveForEve = (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    // A login that works leaves the page, so a settled promise means we are still here.
    action()
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  };
  const name = chain.name;
  const title = t(k('title'), { name });
  const avatar = (
    <div className="flex items-center gap-3">
      <CharacterAvatar characterId={chain.characterId} size="lg" alt={name} />
      <p className="min-w-0 text-text-dim">{t(k('signedIn'), { name })}</p>
    </div>
  );

  if (offering) {
    const chosen = chain.items.filter((i) => ticked.has(i.kind));
    return (
      <Modal
        open
        onClose={onClose}
        title={title}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button onClick={onNotNow}>{t(k('notNow'))}</Button>
            <Button
              variant="primary"
              disabled={chosen.length === 0}
              loading={busy}
              onClick={() => leaveForEve(() => onContinue(chosen))}
            >
              {t(k('continue'))}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {avatar}
          <ul className="space-y-2">
            {chain.items.map((item) => {
              const { label, why } = text(item, name);
              return (
                <li key={item.kind}>
                  <label className={`flex items-start gap-2 ${tappableRowClassName}`}>
                    <Checkbox
                      className="mt-0.5"
                      checked={ticked.has(item.kind)}
                      onChange={(e) =>
                        setTicked((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(item.kind);
                          else next.delete(item.kind);
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-xs text-text-dim">{why}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-dim">{t(k('hint'), { name })}</p>
        </div>
      </Modal>
    );
  }

  const cur = currentApproval(chain);
  const done = isFinished(chain);
  const last = chain.last;
  const lastItem = last && chain.items.find((i) => i.kind === last.kind);
  const lastLabel = lastItem ? text(lastItem, name).label : '';
  const approve = () => leaveForEve(onApprove);
  return (
    <Modal
      open
      onClose={onClose}
      title={done ? t(k('doneTitle'), { name }) : title}
      footer={
        done ? (
          <div className="flex items-center justify-end gap-2">
            <Button onClick={onAddAnother}>{t(k('addAnother'))}</Button>
            <Button variant="primary" onClick={onClose}>
              {t(k('done'))}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button onClick={onClose}>{t(k('stop'))}</Button>
            <Button variant="primary" loading={busy} onClick={approve}>
              {t(k(cur?.kind === 'moon' ? 'moon.action' : 'alerts.action'))}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {failed && <Note tone="danger">{t(k('failed'))}</Note>}
        {last?.result === 'done' && (
          <Note tone="success">{t(k('result.done'), { label: lastLabel })}</Note>
        )}
        {last?.result === 'not-done' && (
          <Note tone="warning">{t(k('result.notDone'), { label: lastLabel })}</Note>
        )}
        {last?.result === 'refused' && (
          <Note tone="warning">
            {t(k('result.refused'), {
              label: lastLabel,
              reason: addCorpsErrorText(t, last.reason),
            })}
          </Note>
        )}
        {last?.result === 'wrong-character' && (
          <Note tone="danger">{t(k('result.wrong'), { signedInAs: last.signedInAs, name })}</Note>
        )}
        {avatar}
        <ul className="divide-y divide-line">
          {chain.items.map((item, i) => {
            const result = chain.results[item.kind];
            return (
              <li key={item.kind} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{text(item, name).label}</span>
                  <span className="block text-xs text-text-dim">{text(item, name).why}</span>
                </span>
                {result === 'done' ? (
                  <Pill tone="success">{t(k('state.done'))}</Pill>
                ) : result === 'not-done' ? (
                  <Pill tone="warning">{t(k('state.notDone'))}</Pill>
                ) : i === chain.index ? (
                  <Pill tone="accent">{t(k('state.now'))}</Pill>
                ) : (
                  <Pill>{t(k('state.next'))}</Pill>
                )}
              </li>
            );
          })}
        </ul>
        {done ? (
          <p className="text-text-dim">{t(k('doneBody'))}</p>
        ) : (
          <p className="text-xs text-text-dim">{t(k('hint'), { name })}</p>
        )}
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Checkbox, Disclosure, Modal, NativeSelect, Panel } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import type { AddCorpsCandidate, CoverageChoice } from '@/engine/corpTaxBook/addCorpsRun';

const k = (key: string) => `corpTaxBook.moons.addCorps.confirm.${key}`;

const CHOICES = ['today', '7', '14', '30'] as const;
const toChoice = (v: string): CoverageChoice =>
  v === 'today' ? 'today' : (Number(v) as 7 | 14 | 30);

/**
 * Step 2: one confirm for the whole batch: what the book sees, and how far back to count.
 * With closed-app alerts on for the account, one checkbox chains each CEO's alerts approval
 * straight after its corp's sign-in (issue #6103); off skips it for the whole run.
 */
export function ConfirmBatchDialog({
  corps,
  offerAlerts = false,
  onBack,
  onConnect,
  onClose,
}: {
  corps: readonly AddCorpsCandidate[];
  /** Whether closed-app alerts are on for the account and some CEO here lacks them. */
  offerAlerts?: boolean;
  onBack: () => void;
  /** `alerts`: chain each CEO's alerts approval after its corp (always false when not offered). */
  onConnect: (choice: CoverageChoice, alerts: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<string>('today');
  const [alerts, setAlerts] = useState(true);
  const [open, setOpen] = useState(false);
  const count = corps.length;
  return (
    <Modal
      open
      onClose={onClose}
      placement="wide"
      title={t(k('title'), { count })}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button onClick={onBack}>{t(k('back_button'))}</Button>
          <Button
            variant="primary"
            onClick={() => onConnect(toChoice(choice), offerAlerts && alerts)}
          >
            {t(k('go'), { count })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title={t(k('seesTitle'))} fill>
            <ul className="list-disc space-y-1 pl-4 text-text-dim">
              <li>{t(k('sees1'))}</li>
              <li>{t(k('sees2'))}</li>
            </ul>
          </Panel>
          <Panel title={t(k('notTitle'))} fill>
            <ul className="list-disc space-y-1 pl-4 text-text-dim">
              <li>{t(k('not1'))}</li>
              <li>{t(k('not2'))}</li>
            </ul>
          </Panel>
        </div>
        <p className="text-text-dim">
          <Trans i18nKey={k('yours')} components={{ pill: <Pill tone="accent">{null}</Pill> }} />
        </p>
        <label className="block space-y-1">
          <span className="font-semibold">{t(k('how'))}</span>
          <NativeSelect
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label={t(k('back.label'))}
          >
            {CHOICES.map((c) => (
              <option key={c} value={c}>
                {t(k(`back.${c}`))}
              </option>
            ))}
          </NativeSelect>
          <span className="block text-xs text-text-dim">{t(k('backHint'), { count })}</span>
        </label>
        {offerAlerts && (
          <label className={`flex items-start gap-2 ${tappableRowClassName}`}>
            <Checkbox
              className="mt-0.5"
              checked={alerts}
              onChange={(e) => setAlerts(e.target.checked)}
            />
            <span>
              <span className="block font-semibold">{t(k('alerts'))}</span>
              <span className="block text-xs text-text-dim">{t(k('alertsHint'))}</span>
            </span>
          </label>
        )}
        <Disclosure
          label={t(k('batch'), { count })}
          expanded={open}
          onToggle={() => setOpen((o) => !o)}
        >
          <ul className="columns-2 space-y-0.5 text-xs text-text-dim">
            {corps.map((c) => (
              <li key={c.corporationId}>
                {c.name} · {c.ceoName}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Modal>
  );
}

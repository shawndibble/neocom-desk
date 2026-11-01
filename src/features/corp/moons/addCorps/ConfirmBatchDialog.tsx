import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Disclosure, Modal, NativeSelect, Panel } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import type { AddCorpsCandidate, CoverageChoice } from '@/engine/corpTaxBook/addCorpsRun';

const k = (key: string) => `corpTaxBook.moons.addCorps.confirm.${key}`;

const CHOICES = ['today', '7', '14', '30'] as const;
const toChoice = (v: string): CoverageChoice =>
  v === 'today' ? 'today' : (Number(v) as 7 | 14 | 30);

/** Step 2: one confirm for the whole batch: what the book sees, and how far back to count. */
export function ConfirmBatchDialog({
  corps,
  onBack,
  onConnect,
  onClose,
}: {
  corps: readonly AddCorpsCandidate[];
  onBack: () => void;
  onConnect: (choice: CoverageChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<string>('today');
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
          <Button variant="primary" onClick={() => onConnect(toChoice(choice))}>
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

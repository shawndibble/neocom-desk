import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineError } from '@/components/ui/InlineError';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Button, Checkbox, Modal, Spinner } from '@/components/ui';
import type { AddCorpsCandidate } from '@/engine/corpTaxBook/addCorpsRun';
import { CorpRow } from './CorpRow';

const k = (key: string) => `corpTaxBook.moons.addCorps.pick.${key}`;

/**
 * Step 1: tick the corps that own moons. Nothing is ticked unless the caller
 * says so (the New corp banner ticks its own): the app cannot see moons before
 * a sign-in.
 */
export function PickCorpsDialog({
  corps,
  loading = false,
  error = false,
  initialSelected = [],
  hiddenCount,
  onDontAsk,
  onOpenHidden,
  onContinue,
  onClose,
}: {
  /** Candidates still offered: hidden ones are already out. */
  corps: readonly AddCorpsCandidate[];
  loading?: boolean;
  error?: boolean;
  initialSelected?: readonly number[];
  hiddenCount: number;
  onDontAsk: (corporationId: number) => void;
  onOpenHidden: () => void;
  onContinue: (selected: AddCorpsCandidate[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number[]>([...initialSelected]);
  // A corp hidden meanwhile drops out of the ticks without a reset.
  const selected = corps.filter((c) => picked.includes(c.corporationId));
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal
      open
      onClose={onClose}
      placement="wide"
      title={t(k('title'))}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hiddenCount > 0 ? (
            <Button size="sm" onClick={onOpenHidden}>
              {t(k('hiddenButton'), { count: hiddenCount })}
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            disabled={selected.length === 0}
            onClick={() => onContinue(selected)}
          >
            {t(k('continue'), { count: selected.length })}
          </Button>
        </div>
      }
    >
      <p className="mb-2 text-sm text-text-dim">{t(k('intro'))}</p>
      {loading && corps.length === 0 ? (
        <Spinner label={t(k('loading'))} />
      ) : error && corps.length === 0 ? (
        <InlineError>{t(k('error'))}</InlineError>
      ) : corps.length === 0 ? (
        <p className="text-sm text-text-dim">{t(k('empty'))}</p>
      ) : (
        <>
          <div className="mb-1 flex gap-2">
            <Button size="sm" onClick={() => setPicked(corps.map((c) => c.corporationId))}>
              {t(k('tickAll'))}
            </Button>
            <Button size="sm" onClick={() => setPicked([])}>
              {t(k('clear'))}
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {corps.map((c) => (
              <CorpRow
                key={c.corporationId}
                name={c.name}
                ceoName={c.ceoName}
                leading={
                  <label className={touchCheckboxLabelClassName}>
                    <Checkbox
                      checked={picked.includes(c.corporationId)}
                      onChange={() => toggle(c.corporationId)}
                      aria-label={t(k('connect'), { name: c.name })}
                    />
                  </label>
                }
                trailing={
                  <Button
                    size="sm"
                    className="shrink-0"
                    aria-label={t(k('dontAskNamed'), { name: c.name })}
                    onClick={() => onDontAsk(c.corporationId)}
                  >
                    {t('corpTaxBook.moons.addCorps.dontAsk')}
                  </Button>
                }
              />
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

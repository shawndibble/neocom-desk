import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import type { AddCorpsCandidate } from '@/engine/corpTaxBook/addCorpsRun';
import { CorpRow } from './CorpRow';

const k = (key: string) => `corpTaxBook.moons.addCorps.hidden.${key}`;

/**
 * Opened only from the picker's "Hidden corps (N)" button, never shown on the
 * page: a corp dismissed with "Don't ask again" stays out of the banner and the
 * picker until it is added back here.
 */
export function HiddenCorpsDialog({
  corps,
  onAdd,
  onClose,
}: {
  corps: readonly AddCorpsCandidate[];
  onAdd: (corporationId: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open
      onClose={onClose}
      title={t(k('title'))}
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose}>{t(k('done'))}</Button>
        </div>
      }
    >
      <p className="mb-2 text-sm text-text-dim">{t(k('intro'))}</p>
      <ul className="divide-y divide-line">
        {corps.map((c) => (
          <CorpRow
            key={c.corporationId}
            name={c.name}
            ceoName={c.ceoName}
            trailing={
              <Button
                size="sm"
                aria-label={t(k('addNamed'), { name: c.name })}
                onClick={() => onAdd(c.corporationId)}
              >
                {t(k('add'))}
              </Button>
            }
          />
        ))}
      </ul>
    </Modal>
  );
}

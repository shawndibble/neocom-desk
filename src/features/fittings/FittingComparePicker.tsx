/**
 * "Compare with…": adds a Fitting to an empty compare slot from My Fittings,
 * In-game Fittings, or a pasted Load (EFT/DNA/killmail link). My Fittings
 * already carries a Share Link `code`; the other two sources hand back a
 * `Fitting` that needs one round of `encodeFittingShare` first.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Tabs, type TabItem } from '@/components/ui';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { InGameFittingsPanel } from './InGameFittingsPanel';
import { loadFittingFromText, type LoadError } from './loadFittingFromText';
import { MyFittingsPanel } from './MyFittingsPanel';

type PickerTab = 'myFittings' | 'inGame' | 'load';

interface FittingComparePickerProps {
  open: boolean;
  onClose: () => void;
  characterId: number | null;
  /** A ready-to-use Share Link code for the newly picked Fitting. */
  onAdd: (code: string) => void;
}

export function FittingComparePicker({
  open,
  onClose,
  characterId,
  onAdd,
}: FittingComparePickerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PickerTab>('myFittings');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  const tabs: TabItem[] = [
    { id: 'myFittings', label: t('fittings.compare.picker.myFittings') },
    { id: 'inGame', label: t('fittings.compare.picker.inGame') },
    { id: 'load', label: t('fittings.compare.picker.load') },
  ];

  /** Encodes a Fitting and adds it if it fits a Share Link; returns whether it was added. */
  async function addEncoded(fitting: Fitting): Promise<boolean> {
    const encoded = await encodeFittingShare(fittingToShareInput(fitting));
    if (!encoded.ok) {
      setTooLarge(true);
      return false;
    }
    onAdd(encoded.payload);
    return true;
  }

  async function addFromLoad() {
    setLoading(true);
    setLoadError(null);
    setTooLarge(false);
    try {
      const result = await loadFittingFromText(text);
      if (result.fitting === null) {
        setLoadError(result.error ?? 'unrecognised');
        return;
      }
      if (await addEncoded(result.fitting)) {
        setText('');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  async function addFromFitting(fitting: Fitting) {
    if (await addEncoded(fitting)) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.compare.picker.title')}>
      <div className="space-y-3">
        <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as PickerTab)} />
        {tooLarge && (
          <p role="alert" className="text-xs text-warning">
            {t('fittings.load.tooLargeToShare')}
          </p>
        )}
        {tab === 'myFittings' && (
          <MyFittingsPanel
            characterId={characterId}
            onOpen={(record) => {
              onAdd(record.code);
              onClose();
            }}
          />
        )}
        {tab === 'inGame' && characterId !== null && (
          <InGameFittingsPanel
            characterId={characterId}
            onOpen={(fitting) => void addFromFitting(fitting)}
          />
        )}
        {tab === 'load' && (
          <div className="space-y-2">
            <label className="block text-xs text-text-dim" htmlFor="compare-picker-load-text">
              {t('fittings.load.pasteLabel')}
            </label>
            <textarea
              id="compare-picker-load-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={t('fittings.load.pastePlaceholder')}
              className={`${fieldBaseClassName} w-full p-2 font-mono text-xs`}
            />
            <Button
              variant="primary"
              disabled={loading || text.trim() === ''}
              onClick={() => void addFromLoad()}
            >
              {t('fittings.load.button')}
            </Button>
            {loadError && (
              <p role="alert" className="text-xs text-danger">
                {t(`fittings.load.loadError.${loadError}`)}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

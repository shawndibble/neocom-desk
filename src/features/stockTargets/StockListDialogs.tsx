/**
 * The Targets tab's small dialogs: name a list (new or rename), delete one,
 * and add items to one by pasting them the way Appraisal takes a paste.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextArea, TextInput } from '@/components/ui';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { matchAppraisalEntries, type AppraisalMatch } from '@/engine/market/appraisalMatch';
import { loadAppraisalCatalogue } from '@/features/market/appraisalData';

export function StockListNameDialog({
  title,
  confirmLabel,
  initialName,
  onSubmit,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialName);
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={title} initialFocusRef={fieldRef}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() === '') return;
          onSubmit(text.trim());
          onClose();
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="stock-list-name">
          {t('stockTargets.list.nameLabel')}
        </label>
        <TextInput
          ref={fieldRef}
          id="stock-list-name"
          className="w-full"
          value={text}
          placeholder={t('stockTargets.list.namePlaceholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={text.trim() === ''}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteStockListDialog({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onClose} title={t('stockTargets.list.deleteTitle')}>
      <div className="space-y-3">
        <p className="text-sm text-text">{t('stockTargets.list.deleteConfirm', { name })}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {t('stockTargets.list.deleteAction')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Add items…": one item per line with the quantity to keep on hand, in any
 * format the Appraisal reads (an inventory copy, `Name x 40`, `40 Name`). A
 * pasted item already on the list takes the new quantity.
 */
export function AddStockItemsDialog({
  listName,
  onAdd,
  onClose,
}: {
  listName: string;
  onAdd: (items: readonly AppraisalMatch[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stockTargets.add.title', { name: listName })}
      initialFocusRef={fieldRef}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void loadAppraisalCatalogue()
            .then((catalogue) => {
              const { matched, unmatched: missed } = matchAppraisalEntries(
                parseAppraisalPaste(text),
                catalogue
              );
              if (matched.length > 0) onAdd(matched);
              if (missed.length === 0) {
                onClose();
                return;
              }
              setUnmatched(missed.map((entry) => entry.name));
              setText(missed.map((entry) => entry.name).join('\n'));
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor="stock-add-items">
          {t('stockTargets.add.label')}
        </label>
        <TextArea
          ref={fieldRef}
          id="stock-add-items"
          rows={8}
          className="w-full font-mono"
          value={text}
          placeholder={t('stockTargets.add.placeholder')}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={unmatched.length > 0 ? 'stock-add-unmatched' : undefined}
        />
        {unmatched.length > 0 && (
          <p id="stock-add-unmatched" role="status" className="text-xs text-warning">
            {t('stockTargets.add.unmatched', { count: unmatched.length })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={text.trim() === ''}>
            {t('stockTargets.add.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

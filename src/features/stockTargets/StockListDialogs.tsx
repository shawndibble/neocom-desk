/**
 * The Stock tab's small dialogs: name a market (rename), delete one,
 * add items to one by searching for each, or by pasting a whole list the way
 * Appraisal takes a paste.
 */
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, LiveStatus, Modal, TextArea, TextInput } from '@/components/ui';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { matchAppraisalEntries, type AppraisalMatch } from '@/engine/market/appraisalMatch';
import { loadAppraisalCatalogue } from '@/features/market/appraisalData';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { MarketTypePicker } from './MarketTypePicker';

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
  const id = useId();
  const [text, setText] = useState(initialName);
  const [error, setError] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={title} initialFocusRef={fieldRef}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() === '') {
            setError(true);
            fieldRef.current?.focus();
            return;
          }
          onSubmit(text.trim());
          onClose();
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor={`${id}-name`}>
          {t('stockTargets.list.nameLabel')}
        </label>
        <TextInput
          ref={fieldRef}
          id={`${id}-name`}
          className="w-full"
          value={text}
          placeholder={t('stockTargets.list.namePlaceholder')}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
        {error && (
          <FieldError id={`${id}-error`} className="block text-xs">
            {t('stockTargets.list.nameRequired')}
          </FieldError>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary">
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
  returnFocusFallback,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Where focus goes when the ⋮ that opened this is gone with the list (the last one). */
  returnFocusFallback: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stockTargets.list.deleteTitle')}
      returnFocusFallback={returnFocusFallback}
    >
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
 * "Add items…": search the market catalogue for one item at a time, give it a
 * quantity, Add. The dialog stays open for the next item, saying what was
 * added, so building a market list is a run of search-type-Enter.
 */
export function AddStockItemDialog({
  listName,
  onAdd,
  onClose,
}: {
  listName: string;
  onAdd: (typeId: number, quantity: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<MarketTypeEntry | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<{ field: 'item' | 'quantity'; text: string } | null>(null);
  const [added, setAdded] = useState<{ name: string; quantity: number; n: number } | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('stockTargets.add.searchTitle', { name: listName })}
      initialFocusRef={searchRef}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Math.floor(Number(quantity));
          if (!picked) {
            setError({ field: 'item', text: t('stockTargets.add.pickItem') });
            searchRef.current?.focus();
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            setError({ field: 'quantity', text: t('stockTargets.add.quantityRequired') });
            quantityRef.current?.focus();
            return;
          }
          onAdd(picked.typeId, amount);
          setAdded((prev) => ({ name: picked.name, quantity: amount, n: (prev?.n ?? 0) + 1 }));
          setPicked(null);
          setResetKey((n) => n + 1);
          setQuantity('');
          setError(null);
          searchRef.current?.focus();
        }}
      >
        <MarketTypePicker
          inputRef={searchRef}
          label={t('stockTargets.add.searchLabel')}
          placeholder={t('stockTargets.add.searchPlaceholder')}
          unavailableText={t('stockTargets.add.searchUnavailable')}
          picked={picked}
          resetKey={resetKey}
          invalid={error?.field === 'item'}
          describedBy={error?.field === 'item' ? `${id}-error` : undefined}
          onPick={(type) => {
            setPicked(type);
            if (type) setError(null);
          }}
        />
        <div className="space-y-1">
          <label className="block text-xs text-text-dim" htmlFor={`${id}-quantity`}>
            {t('stockTargets.dialog.quantity')}
          </label>
          <TextInput
            id={`${id}-quantity`}
            type="number"
            min={1}
            className="w-full"
            value={quantity}
            ref={quantityRef}
            aria-invalid={error?.field === 'quantity' || undefined}
            aria-describedby={error?.field === 'quantity' ? `${id}-error` : undefined}
            onChange={(e) => {
              setQuantity(e.target.value);
              setError(null);
            }}
          />
        </div>
        {error !== null && (
          <FieldError id={`${id}-error`} className="block text-xs">
            {error.text}
          </FieldError>
        )}
        <p className="text-xs text-text-dim">
          <LiveStatus announceKey={added?.n}>
            {added && t('stockTargets.add.added', { name: added.name, count: added.quantity })}
          </LiveStatus>
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('stockTargets.add.done')}</Button>
          <Button type="submit" variant="primary">
            {t('stockTargets.add.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * "Paste a list…": one item per line with the quantity to keep listed, in
 * any format the Appraisal reads (an inventory copy, `Name x 40`, `40 Name`).
 * A pasted item already on the list takes the new quantity.
 */
export function PasteStockItemsDialog({
  listName,
  onAdd,
  onClose,
}: {
  listName: string;
  onAdd: (items: readonly AppraisalMatch[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [submits, setSubmits] = useState(0);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  // The item catalogue is a lazy download; offline it may be missing.
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const describedBy = [unmatched.length > 0 && `${id}-unmatched`, empty && `${id}-error`]
    .filter(Boolean)
    .join(' ');
  return (
    <Modal
      open
      onClose={onClose}
      title={t('stockTargets.add.pasteTitle', { name: listName })}
      initialFocusRef={fieldRef}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() === '') {
            setEmpty(true);
            return;
          }
          setBusy(true);
          setCatalogueFailed(false);
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
              setSubmits((n) => n + 1);
              setText(missed.map((entry) => entry.name).join('\n'));
            })
            .catch(() => setCatalogueFailed(true))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-xs text-text-dim" htmlFor={`${id}-text`}>
          {t('stockTargets.add.label')}
        </label>
        <TextArea
          ref={fieldRef}
          id={`${id}-text`}
          rows={8}
          className="w-full font-mono"
          value={text}
          placeholder={t('stockTargets.add.placeholder')}
          onChange={(e) => {
            setText(e.target.value);
            setEmpty(false);
          }}
          aria-invalid={empty || undefined}
          aria-describedby={describedBy || undefined}
        />
        {empty && (
          <FieldError id={`${id}-error`} className="block text-xs">
            {t('stockTargets.add.pasteRequired')}
          </FieldError>
        )}
        {catalogueFailed && (
          <FieldError id={`${id}-unavailable`} className="block text-xs">
            {t('stockTargets.add.pasteUnavailable')}
          </FieldError>
        )}
        {unmatched.length > 0 && (
          <p id={`${id}-unmatched`} className="text-xs text-warning">
            {t('stockTargets.add.unmatched', { count: unmatched.length })}
          </p>
        )}
        {/* Always mounted, so a repeat of the same message is announced too (DESIGN.md §7). */}
        <LiveStatus announceKey={submits}>
          {unmatched.length > 0 && t('stockTargets.add.unmatched', { count: unmatched.length })}
        </LiveStatus>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('stockTargets.add.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

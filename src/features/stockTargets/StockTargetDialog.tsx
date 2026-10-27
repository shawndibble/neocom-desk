/**
 * The item menu's "Set stock target": put one item on a market's **Stock
 * List** with how many to keep listed, from wherever the pilot noticed they
 * need it. A market is set up on Market › Stock, where its station is picked;
 * with none yet, the dialog points there.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  FieldError,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { removeStockTarget, setStockTarget } from '@/engine/stockTargets/stockLists';
import { useSelectedStockList, useStockLists } from './stockListsStore';
import { useHydratedStore } from '@/lib/useHydratedStore';

const STOCK_PATH = '/market/stock';

export function StockTargetDialog({
  typeId,
  itemName,
  onClose,
}: {
  typeId: number;
  itemName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const navigate = useNavigate();
  const lists = useStockLists((state) => state.value);
  const hydrated = useHydratedStore(useStockLists);
  const setLists = useStockLists((state) => state.setValue);
  const selectedId = useSelectedStockList((state) => state.value);
  const setSelectedId = useSelectedStockList((state) => state.setValue);
  useHydratedStore(useSelectedStockList);

  const defaultList = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;
  const [listChoice, setListChoice] = useState<string | null>(null);
  const list = lists.find((l) => l.id === (listChoice ?? defaultList?.id)) ?? null;
  const existing = list?.items.find((item) => item.typeId === typeId)?.target;
  const [quantity, setQuantity] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const openStockRef = useRef<HTMLButtonElement>(null);

  // The form mounts once the lists have loaded, after the Modal's own first focus.
  useEffect(() => {
    if (!hydrated) return;
    (lists.length > 0 ? quantityRef : openStockRef).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the first render after loading decides where focus lands
  }, [hydrated]);

  const quantityValue = quantity ?? (existing !== undefined ? String(existing) : '');
  const parsed = Math.floor(Number(quantityValue));

  function save() {
    if (!list) return;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(true);
      quantityRef.current?.focus();
      return;
    }
    void setLists(setStockTarget(lists, list.id, typeId, parsed));
    void setSelectedId(list.id);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={t('stockTargets.dialog.title', { name: itemName })}>
      {hydrated && lists.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-text">{t('stockTargets.dialog.noMarkets')}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              ref={openStockRef}
              variant="primary"
              onClick={() => {
                onClose();
                navigate(STOCK_PATH);
              }}
            >
              {t('stockTargets.dialog.openStock')}
            </Button>
          </div>
        </div>
      )}
      {hydrated && list && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1">
            <label className="block text-xs text-text-dim" id={`${id}-list`}>
              {t('stockTargets.dialog.list')}
            </label>
            <Select
              value={list.id}
              onValueChange={(value) => {
                setListChoice(value);
                setQuantity(null);
              }}
            >
              <SelectTrigger aria-labelledby={`${id}-list`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-text-dim" htmlFor={`${id}-quantity`}>
              {t('stockTargets.dialog.quantity')}
            </label>
            <TextInput
              ref={quantityRef}
              id={`${id}-quantity`}
              type="number"
              min={1}
              className="w-full"
              value={quantityValue}
              aria-invalid={error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError(false);
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
            {error && (
              <FieldError id={`${id}-error`} className="block text-xs">
                {t('stockTargets.add.quantityRequired')}
              </FieldError>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {existing !== undefined && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  void setLists(removeStockTarget(lists, list.id, typeId));
                  onClose();
                }}
              >
                {t('stockTargets.dialog.remove')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary">
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

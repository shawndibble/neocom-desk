/**
 * The item menu's "Set stock target…": put one item on a **Stock List** with
 * how many to keep on hand, from wherever the pilot noticed they need it.
 * With no list yet, the dialog names the first one in the same step.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import { addStockList, removeStockTarget, setStockTarget } from '@/engine/stockTargets/stockLists';
import { newStockListId, useSelectedStockList, useStockLists } from './stockListsStore';

const NEW_LIST = 'new';

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
  const lists = useStockLists((state) => state.value);
  const hydrated = useStockLists((state) => state.hydrated);
  const hydrate = useStockLists((state) => state.hydrate);
  const setLists = useStockLists((state) => state.setValue);
  const selectedId = useSelectedStockList((state) => state.value);
  const hydrateSelected = useSelectedStockList((state) => state.hydrate);
  const setSelectedId = useSelectedStockList((state) => state.setValue);
  useEffect(() => {
    void hydrate();
    void hydrateSelected();
  }, [hydrate, hydrateSelected]);

  const defaultList = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;
  const [listChoice, setListChoice] = useState<string | null>(null);
  const chosen = listChoice ?? defaultList?.id ?? NEW_LIST;
  const list = lists.find((l) => l.id === chosen) ?? null;
  const existing = list?.items.find((item) => item.typeId === typeId)?.target;
  const [quantity, setQuantity] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const quantityRef = useRef<HTMLInputElement>(null);

  const quantityValue = quantity ?? (existing !== undefined ? String(existing) : '');
  const parsed = Math.floor(Number(quantityValue));
  const valid =
    Number.isFinite(parsed) && parsed > 0 && (chosen !== NEW_LIST || newName.trim() !== '');

  function save() {
    if (!valid) return;
    let next = lists;
    let listId = chosen;
    if (chosen === NEW_LIST) {
      listId = newStockListId();
      next = addStockList(next, { id: listId, name: newName });
    }
    void setLists(setStockTarget(next, listId, typeId, parsed));
    void setSelectedId(listId);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('stockTargets.dialog.title', { name: itemName })}
      initialFocusRef={quantityRef}
    >
      {hydrated && (
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
              value={chosen}
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
                <SelectItem value={NEW_LIST}>{t('stockTargets.dialog.newList')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {chosen === NEW_LIST && (
            <div className="space-y-1">
              <label className="block text-xs text-text-dim" htmlFor={`${id}-name`}>
                {t('stockTargets.list.nameLabel')}
              </label>
              <TextInput
                id={`${id}-name`}
                className="w-full"
                value={newName}
                placeholder={t('stockTargets.list.namePlaceholder')}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
          )}
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
              onChange={(e) => setQuantity(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {list && existing !== undefined && (
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
            <Button type="submit" variant="primary" disabled={!valid}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

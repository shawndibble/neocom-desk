/**
 * The Quickbar (CONTEXT.md): a flat, drag-ordered list of saved item
 * shortcuts, rendered in the Market Browser's left column below the tree.
 * Drag-and-drop mirrors the Skill Plan entry list (EntryList.tsx).
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { typeIconUrl } from '@/lib/eveImages';
import { formatIsk, formatIskCompact, parseIskAmount } from '@/lib/isk';
import type { QuickbarItem } from '@/db';

export type QuickbarTarget = { price: number; direction: 'above' | 'below' } | null;

/**
 * The target-price popover's own form state, editing a copy rather than the
 * item directly — only committed to the Quickbar on Save (issue #680).
 * Radix unmounts `PopoverContent` on close by default, so this component
 * remounts (and so re-reads `item`'s current target into its initial state)
 * every time the popover opens rather than needing a sync effect.
 */
function PriceAlertForm({
  item,
  onSave,
  onClear,
  onClose,
}: {
  item: QuickbarItem;
  onSave: (target: { price: number; direction: 'above' | 'below' }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<'above' | 'below'>(item.targetDirection ?? 'above');
  const [text, setText] = useState(
    item.targetPrice !== undefined ? formatIsk(item.targetPrice) : ''
  );
  const hasTarget = item.targetPrice !== undefined;

  function handleSave() {
    const amount = parseIskAmount(text);
    if (amount === null || amount <= 0) return;
    onSave({ price: Math.round(amount), direction });
    onClose();
  }

  return (
    <div className="flex w-48 flex-col gap-2 p-2 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-text-dim">{t('market.quickbar.priceAlert.priceLabel')}</span>
        <TextInput
          size="sm"
          type="text"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Select value={direction} onValueChange={(value) => setDirection(value as typeof direction)}>
        <SelectTrigger size="sm" aria-label={t('market.quickbar.priceAlert.directionLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="above">{t('market.quickbar.priceAlert.directionAbove')}</SelectItem>
          <SelectItem value="below">{t('market.quickbar.priceAlert.directionBelow')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-2">
        {hasTarget && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            {t('market.quickbar.priceAlert.clear')}
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={handleSave}>
          {t('market.quickbar.priceAlert.save')}
        </Button>
      </div>
    </div>
  );
}

interface QuickbarRowProps {
  item: QuickbarItem;
  selected: boolean;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onSetTarget: (typeId: number, target: QuickbarTarget) => void;
}

function QuickbarRow({ item, selected, onSelect, onRemove, onSetTarget }: QuickbarRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.typeId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hasTarget = item.targetPrice !== undefined && item.targetDirection !== undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 border-b border-line px-1 py-1 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('market.quickbar.reorderItem', { name: item.name })}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      <button
        type="button"
        onClick={() => onSelect(item.typeId)}
        aria-current={selected ? 'true' : undefined}
        className={`flex flex-1 items-center gap-1.5 truncate text-left hover:text-accent ${
          selected ? 'text-accent' : 'text-text-dim'
        }`}
      >
        <img src={typeIconUrl(item.typeId, 32)} alt="" className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.name}</span>
        {hasTarget && (
          <span className="shrink-0 text-text-faint">
            {(item.targetDirection === 'above' ? '≥ ' : '≤ ') + formatIskCompact(item.targetPrice!)}
          </span>
        )}
      </button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <IconButton
            size="sm"
            icon={<Icon.PriceAlert />}
            label={t('market.quickbar.priceAlert.button', { name: item.name })}
            pressed={hasTarget}
          />
        </PopoverTrigger>
        <PopoverContent align="end">
          <PriceAlertForm
            item={item}
            onSave={(target) => onSetTarget(item.typeId, target)}
            onClear={() => onSetTarget(item.typeId, null)}
            onClose={() => setPopoverOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        label={t('market.quickbar.removeItem', { name: item.name })}
        tone="danger"
        onClick={() => onRemove(item.typeId)}
      />
    </li>
  );
}

export interface QuickbarListProps {
  items: readonly QuickbarItem[];
  selectedTypeId: number | null;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onReorder: (activeTypeId: number, overTypeId: number) => void;
  onSetTarget: (typeId: number, target: QuickbarTarget) => void;
}

export function QuickbarList({
  items,
  selectedTypeId,
  onSelect,
  onRemove,
  onReorder,
  onSetTarget,
}: QuickbarListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(Number(active.id), Number(over.id));
  }

  return (
    <div className="mt-3 border-t border-line pt-2">
      <h2 className="pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.quickbar.title')}
      </h2>
      {items.length === 0 ? (
        <p className="pt-1 text-xs text-text-dim">{t('market.quickbar.empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((i) => i.typeId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="rounded-xs border border-line">
              {items.map((item) => (
                <QuickbarRow
                  key={item.typeId}
                  item={item}
                  selected={item.typeId === selectedTypeId}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  onSetTarget={onSetTarget}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

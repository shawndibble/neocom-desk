import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, RowMoreActions, TextInput } from '@/components/ui';
import { gripHitAreaClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { ItemInfoLink } from '@/features/entities';
import { AddRow, Close, DragHandle } from '@/components/ui/icons';
import type { Fitting } from '@/engine/fittings/types';
import { useOptionalItemActions } from '@/features/market/itemActions';
import { useOverBudgetFlash } from './useOverBudgetFlash';
import { MakeItFitTrigger } from './MakeItFitTrigger';
import type { FitResource } from './makeItFitContext';
import { endFittingDrag, startFittingDrag, type FittingDragPayload } from './fittingDrag';
import { FittingItemMenu } from './FittingItemMenu';
import type { useFittingDropTarget } from './fittingItemActions';
import type { FittingContext } from './fittingContext';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';
import { fixed1 } from '@/lib/fixedFormat';

export const RACK_LABEL_CLASS =
  'mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

interface ResourceBarProps {
  label: string;
  used: number | null;
  total: number | null;
  /** A budget Make it fit can fix: over budget, it gets its "Fix" link. */
  resource?: FitResource;
}

/**
 * A CPU/PG/calibration/drone-bandwidth bar. `null` used/total render as a loading skeleton.
 * Over budget turns `danger` with the overage stated in words, and flashes once
 * each time the readout goes from within budget to over (a Character switch
 * that re-states it included) — the `null` gap while it recomputes doesn't count.
 */
export function ResourceBar({ label, used, total, resource }: ResourceBarProps) {
  const { t } = useTranslation();
  const { overage, overBudget, flashKey } = useOverBudgetFlash(used, total);
  const known = used !== null && total !== null;
  const pct = known && total > 0 ? Math.min(100, (used / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-28 shrink-0 text-text-dim">{label}</span>
        <div
          role="meter"
          aria-label={label}
          aria-valuenow={known ? used : undefined}
          aria-valuemax={known ? total : undefined}
          className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2"
        >
          {known && (
            <div
              className={`h-full rounded-full ${overBudget ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span
          key={flashKey}
          className={`w-24 shrink-0 text-right ${overBudget ? 'text-danger' : 'text-text-dim'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
        >
          {known ? `${fixed1(used)} / ${fixed1(total)}` : '…'}
        </span>
      </div>
      {overBudget && (
        <>
          <p className="pl-30 text-right text-xs text-danger">
            {t('fittings.list.overBy', { amount: fixed1(overage) })}
          </p>
          {resource && (
            <div className="flex justify-end">
              <MakeItFitTrigger resource={resource} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface EditContext {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  /** The engine, pilot and catalogue for fit checks; null while any of them loads. */
  context: FittingContext | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
}

/**
 * A fitted item's name: a link to its Show info, when the page has Item
 * Actions (a shared-fitting preview renders no provider, and stays a span).
 * View in Market is in the row's ⋮ menu.
 */
export function SlotName({ typeId, name }: { typeId: number; name: string }) {
  const actions = useOptionalItemActions();
  if (!actions) return <span className={SLOT_NAME_CLASS}>{name}</span>;
  return (
    <ItemInfoLink typeId={typeId} className={`${SLOT_NAME_CLASS} ${tappableRowClassName}`}>
      {name}
    </ItemInfoLink>
  );
}

export const SLOT_NAME_CLASS =
  'line-clamp-2 min-w-0 flex-1 text-left text-sm break-words @min-[44rem]:min-w-40 @min-[44rem]:truncate @min-[44rem]:text-xs';

/**
 * A fitted module's, drone's or cargo item's card. In a narrow column (a
 * phone) the name gets the first line to itself — two lines if it needs
 * them — with its menu and remove in the top-right corner as on the app's
 * other cards, and the controls below; with room, it is one line, remove
 * last. On one line the name keeps 10rem and the controls give up space
 * first; 44rem is where the widest row (a drone with its mutation badge)
 * still fits that way. With `menu`, right-click (or touch-and-hold) anywhere
 * on it opens the item's menu, and a ⋮ button opens the same.
 */
export function SlotCard({
  identity,
  removeLabel,
  onRemove,
  children,
  menu,
  drop,
  grip,
}: {
  identity: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
  menu?: { name: string; items: ReactNode } | null;
  /** From `useFittingDropTarget`: the card takes the List's drags. */
  drop?: ReturnType<typeof useFittingDropTarget>;
  /** A pointer's drag handle for the card, and what dragging it carries. */
  grip?: { payload: FittingDragPayload; label: string };
}) {
  const highlight = drop?.over
    ? 'ring-2 ring-accent/60'
    : drop?.lights === 'lit' || drop?.accepts
      ? 'outline-1 outline-dashed outline-accent'
      : '';
  const card = (
    <div
      className={`@container rounded-xs bg-panel-2 ${highlight} ${drop?.lights === 'dim' ? 'opacity-40' : ''}`}
      {...drop?.props}
    >
      <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1.5 p-1.5 @min-[44rem]:flex-nowrap">
        <div
          className={`flex min-h-9 min-w-0 basis-full items-center gap-2 @min-[44rem]:min-h-0 @min-[44rem]:min-w-auto @min-[44rem]:flex-1 @min-[44rem]:basis-0 @min-[44rem]:pr-0 ${menu ? 'pr-22' : 'pr-11'}`}
        >
          {grip && (
            <span
              draggable
              role="img"
              aria-label={grip.label}
              onDragStart={(event) => startFittingDrag(event, grip.payload)}
              onDragEnd={endFittingDrag}
              className={`flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-text-dim active:cursor-grabbing ${gripHitAreaClassName}`}
            >
              <DragHandle aria-hidden />
            </span>
          )}
          {identity}
        </div>
        {/* The controls keep their own right-click and press-and-hold (a count
            box's paste or text selection) rather than opening the item's menu. */}
        <div
          className="flex min-w-0 basis-full items-center gap-2 @min-[44rem]:basis-auto"
          onContextMenu={menu ? (event) => event.stopPropagation() : undefined}
          onPointerDown={menu ? (event) => event.stopPropagation() : undefined}
        >
          {children}
        </div>
        <div className="absolute top-0 right-0 flex @min-[44rem]:static">
          {menu && <RowMoreActions />}
          <IconButton
            icon={<Close />}
            tone="danger"
            variant="plain"
            label={removeLabel}
            onClick={onRemove}
          />
        </div>
      </div>
    </div>
  );
  return menu ? (
    <FittingItemMenu name={menu.name} items={menu.items}>
      {card}
    </FittingItemMenu>
  ) : (
    card
  );
}

/**
 * A drone or cargo count box. Keeps what's being typed as a local draft, so
 * the box can be emptied on the way to a new number instead of snapping back;
 * each complete number is committed as it's typed — capped at `max` when
 * given (for drones, what the bay holds), a number over it showing as the cap.
 * With `min`, a number below it stays a draft rather than being committed.
 */
export function CountInput({
  label,
  value,
  max = Number.POSITIVE_INFINITY,
  min = 0,
  onCommit,
}: {
  label: string;
  value: number;
  max?: number;
  min?: number;
  onCommit: (count: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1 text-xs text-text-dim">
      {label}
      <TextInput
        type="number"
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        size="sm"
        className="w-16"
        value={draft ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < min) {
            setDraft(raw);
            return;
          }
          const count = Math.min(Number(raw), max);
          setDraft(count === Number(raw) ? raw : String(count));
          onCommit(count);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

export function AddSlotButton({
  label,
  selected,
  onClick,
  drop,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /** From `useFittingDropTarget`: an Add panel module, or a module moved along its rack, lands here. */
  drop?: ReturnType<typeof useFittingDropTarget>;
}) {
  return (
    <Button
      align="start"
      className={`w-full border border-dashed ${selected || drop?.over ? 'border-accent bg-accent/10' : drop?.accepts ? 'border-accent' : 'border-line'}`}
      aria-pressed={selected}
      onClick={onClick}
      {...drop?.props}
    >
      <AddRow aria-hidden />
      {label}
    </Button>
  );
}

import { cx } from '@/lib/cx';

export type ControlSize = 'sm' | 'md';

export const interactiveClassName =
  'transition-[color,background-color,border-color,text-decoration-color,outline-color] duration-120 ease-out active:duration-40 motion-reduce:transition-none';

export const focusRingClassName =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const activeOptionClassName =
  'in-data-[input=keyboard]:outline-2 in-data-[input=keyboard]:-outline-offset-2 in-data-[input=keyboard]:outline-accent';

export const highlightedOptionClassName =
  'data-[highlighted]:in-data-[input=keyboard]:outline-2 data-[highlighted]:in-data-[input=keyboard]:-outline-offset-2 data-[highlighted]:in-data-[input=keyboard]:outline-accent';

export const focusRingInsetClassName =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

export const stackedLabelClassName = 'block text-[0.6875rem] text-text-dim';

export const rowInteractiveClassName = cx('hover:bg-panel-2 active:bg-panel', interactiveClassName);

export const disabledClassName =
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

export const selectedRowClassName =
  'border-l-2 border-l-accent bg-panel-2 [&_.dt-primary]:text-accent';

export const controlHeightClassName: Record<ControlSize, string> = {
  sm: 'h-9 md:h-7 touch:h-9',
  md: 'h-9',
};

export const fieldBaseClassName =
  'rounded-xs border border-line-bright bg-panel-2 text-text placeholder:text-text-dim focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40';

export const fieldSizeClassName: Record<ControlSize, string> = {
  sm: `${controlHeightClassName.sm} px-2 text-xs`,
  md: `${controlHeightClassName.md} px-3 text-sm`,
};

export function selectTriggerClassName(size: ControlSize): string {
  return cx(
    fieldBaseClassName,
    fieldSizeClassName[size],
    'flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap [&>span]:min-w-0 [&>span]:truncate',
    'data-[active]:border-accent'
  );
}

export const tappableRowClassName = 'min-h-9 md:min-h-7 touch:min-h-9';

export const suggestionPopupClassName =
  'absolute z-20 mt-1 w-full overflow-hidden rounded-xs border border-line-bright bg-panel shadow-lg';

export const suggestionListClassName =
  'overflow-hidden rounded-xs border border-line-bright bg-panel';

export const suggestionOptionClassName = (active: boolean) =>
  cx(
    tappableRowClassName,
    'flex cursor-pointer items-center border-l-2 px-3 text-sm',
    active ? 'border-accent bg-panel-2 font-semibold' : 'border-transparent hover:bg-panel-2'
  );

export const touchCheckboxLabelClassName =
  'inline-flex shrink-0 items-center justify-center touch:size-9';

export const gripHitAreaClassName =
  "touch:relative touch:before:absolute touch:before:inset-x-0 touch:before:top-1/2 touch:before:h-9 touch:before:-translate-y-1/2 touch:before:content-['']";

export const resizeHandleTouchClassName = 'touch:h-9';

export const grabberClassName = 'h-1 w-10 rounded-full bg-line-bright';

export const inlineLinkClassName = cx(
  'text-accent font-medium underline decoration-1 underline-offset-2 rounded-xs hover:decoration-2 active:text-accent/75',
  interactiveClassName,
  focusRingClassName
);

export const popoverValueClassName = cx(
  'rounded-xs text-accent underline decoration-dashed underline-offset-2 hover:decoration-solid',
  focusRingClassName
);

export const figureOpenerClassName = cx(
  'cursor-pointer rounded-xs underline decoration-dashed decoration-current/70 underline-offset-2 hover:text-accent',
  focusRingInsetClassName
);

export function toggleChipStateClassName(
  selected: boolean,
  { hoverable = true }: { hoverable?: boolean } = {}
): string {
  if (selected) {
    return hoverable
      ? 'border-accent-dim bg-accent/15 text-accent hover:bg-accent/22 active:bg-accent/28'
      : 'border-accent-dim bg-accent/15 text-accent';
  }
  const off = 'border-line bg-panel-2 text-text-dim';
  return hoverable ? `${off} hover:border-line-bright hover:text-text active:bg-panel` : off;
}

export const hintCueClassName =
  'underline decoration-dotted decoration-current/70 underline-offset-2';

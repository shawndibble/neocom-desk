import {
  controlHeightClassName,
  focusRingInsetClassName,
  interactiveClassName,
} from './controlStyles';

export const tabScrollerClassName = 'tab-scroller overflow-x-auto overscroll-x-contain';

export const tabChevronClassName = [
  'absolute top-1/2 z-10 grid size-6 -translate-y-[calc(50%+0.5px)] place-items-center rounded-xs',
  'border border-line-bright bg-panel-2 text-text-dim shadow-lg shadow-black/50',
  'max-md:hidden touch:hidden hover:text-text active:text-accent',
  interactiveClassName,
].join(' ');

export const tabListClassName = 'flex w-max min-w-full items-end gap-1 border-b border-line';

export const tabListFlushClassName = 'flex items-end gap-1';

export const tabItemClassName = `-mb-px inline-flex ${controlHeightClassName.md} shrink-0 items-center border-b-2 px-3 text-xs font-semibold tracking-widest whitespace-nowrap uppercase ${interactiveClassName} ${focusRingInsetClassName}`;

export const tabItemActiveClassName = 'border-accent bg-panel-2/60 text-text';

export const tabItemIdleClassName =
  'border-transparent text-text-dim hover:bg-panel-2/40 hover:text-text active:bg-panel-2/70';

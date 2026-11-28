import { createElement, type HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

const WELL_SIZE_CLASS = { sm: 'p-2', md: 'p-2.5', lg: 'p-3', flat: 'px-3 py-2' } as const;

const WELL_TONE_CLASS = {
  neutral: 'border-line bg-panel-2',
  accent: 'border-accent-dim bg-accent/10',
  warning: 'border-warning/60 bg-warning/10',
  danger: 'border-danger/60 bg-danger/10',
} as const;

type WellTone = keyof typeof WELL_TONE_CLASS;

interface WellProps extends HTMLAttributes<HTMLElement> {
  size?: keyof typeof WELL_SIZE_CLASS;
  /** @summary The box's edge and fill: `neutral` for a readout, a status tone for a callout. */
  tone?: WellTone;
  as?: 'div' | 'p' | 'section' | 'li';
}

/** @summary An inset box with a hairline, for a note, callout or readout inside a Panel or dialog. */
export function Well({ size = 'sm', tone = 'neutral', as = 'div', className, ...rest }: WellProps) {
  return createElement(as, {
    ...rest,
    className: cx('rounded-xs border', WELL_TONE_CLASS[tone], WELL_SIZE_CLASS[size], className),
  });
}

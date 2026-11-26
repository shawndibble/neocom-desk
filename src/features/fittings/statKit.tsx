import { Fragment, type ReactNode } from 'react';

export const STAT_EYEBROW_TYPE = 'text-[0.6875rem] font-semibold tracking-widest uppercase';

export const STAT_EYEBROW = `${STAT_EYEBROW_TYPE} text-text-dim`;

export const STAT_FIELD_WIDTH = 'w-36';

export const STAT_DETAIL = 'text-[0.6875rem] font-normal text-text-dim tabular-nums';

export function statRowClassName(total = false): string {
  return `flex flex-col gap-0.5 border-t py-2 first:border-t-0 first:pt-0 last:pb-0 ${
    total ? 'border-line-bright font-semibold' : 'border-line'
  }`;
}

export function joinDetail(parts: readonly ReactNode[]): ReactNode {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== '');
  return shown.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && ' · '}
      <span>{part}</span>
    </Fragment>
  ));
}

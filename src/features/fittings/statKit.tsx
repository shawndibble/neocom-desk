import { Fragment, type ReactNode } from 'react';

/*
 * The stats column's one body kit. Every section is built from these, so
 * the column reads in three sizes only: 12px names and values (`text-xs`),
 * 11px for everything dim beneath them (detail lines, fact labels, notes,
 * small-caps labels), and the 14px headline on each section's own row.
 */

/** The small-caps type, without a colour: the resist table tints it per damage type. */
export const STAT_EYEBROW_TYPE = 'text-[0.6875rem] font-semibold tracking-widest uppercase';

/** A small-caps label: a group inside a section, a table's column heads. */
export const STAT_EYEBROW = `${STAT_EYEBROW_TYPE} text-text-dim`;

/** The dim line under a row's name: its charge, range, cycle — or what it changes. */
export const STAT_DETAIL = 'text-[0.6875rem] font-normal text-text-dim tabular-nums';

/**
 * One row of a `StatRows` list, for a caller that renders its own `<li>`
 * (one wrapped in a row menu). A hairline sits between rows; a total's is
 * brighter, so it reads as a sum rather than one more row.
 */
export function statRowClassName(total = false): string {
  return `flex flex-col gap-0.5 border-t py-2 first:border-t-0 first:pt-0 last:pb-0 ${
    total ? 'border-line-bright font-semibold' : 'border-line'
  }`;
}

/** Pieces of a detail line, joined by a middle dot; empty pieces are left out. */
export function joinDetail(parts: readonly ReactNode[]): ReactNode {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== '');
  return shown.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && ' · '}
      <span>{part}</span>
    </Fragment>
  ));
}

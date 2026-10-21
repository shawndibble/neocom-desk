/**
 * How a widget's Size becomes flex rules for the grid's rows.
 *
 * Flex-wrap rows with no gap-filling: a row's leftover width is shared by
 * `flex-grow`, so there are no holes and reading order is screen order. Plain
 * data so it can be pinned by a test; the grid applies it as inline style
 * because the basis is computed from `SIZE_LAYOUT`, not a fixed class.
 */
import type { WidgetSize } from './kinds';
import { SIZE_LAYOUT } from './sizes';

/** The gap between widgets, px. The basis subtracts it so four Smalls fit one row. */
export const GRID_GAP = 12;
export const PHONE_GRID_GAP = 10;

export interface FlexRule {
  flexGrow: number;
  flexShrink: number;
  flexBasis: string;
  minWidth: number;
}

export function flexRule(size: WidgetSize, phone: boolean): FlexRule {
  if (phone) {
    // S two across; M, L and Full take the whole row.
    return size === 'S'
      ? { flexGrow: 1, flexShrink: 1, flexBasis: `calc(50% - ${PHONE_GRID_GAP}px)`, minWidth: 0 }
      : { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth: 0 };
  }
  const { basis, minWidth } = SIZE_LAYOUT[size];
  if (basis >= 1) return { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth };
  return {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: `calc(${(basis * 100).toFixed(3)}% - ${GRID_GAP}px)`, // fixed format: CSS calc
    minWidth,
  };
}

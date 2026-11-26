import type { WidgetSize } from './kinds';
import { SIZE_LAYOUT } from './sizes';

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
    return size === 'S'
      ? { flexGrow: 1, flexShrink: 1, flexBasis: `calc(50% - ${PHONE_GRID_GAP}px)`, minWidth: 0 }
      : { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth: 0 };
  }
  const { basis, minWidth } = SIZE_LAYOUT[size];
  if (basis >= 1) return { flexGrow: 1, flexShrink: 1, flexBasis: '100%', minWidth };
  return {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: `calc(${(basis * 100).toFixed(3)}% - ${GRID_GAP}px)`,
    minWidth,
  };
}

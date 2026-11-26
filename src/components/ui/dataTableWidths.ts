const cellPadRem = (density: 'default' | 'compact') => (density === 'compact' ? 1 : 1.5);

export function columnCellWidth(width: string, density: 'default' | 'compact'): string {
  return `calc(${width} + ${cellPadRem(density)}rem)`;
}

export const TRAILING_COL_EXPAND_REM = 2;
export const TRAILING_COL_ACTIONS_REM = 2.5;

export const COL_DATETIME = '21ch';
export const COL_DATETIME_STACKED = '11ch';
export const COL_DATE = '11ch';
export const COL_ISK = '19ch';
export const COL_QUANTITY = '12ch';
export const COL_SMALL_NUMBER = '8ch';
export const COL_ICON = '5ch';

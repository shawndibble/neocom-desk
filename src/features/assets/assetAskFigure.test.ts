import { describe, expect, it } from 'vitest';
import { askEstimateFigure } from './assetAskFigure';

const t = ((key: string, o?: Record<string, unknown>) => `${key}:${o?.price}:${o?.count}`) as never;
const estimates = new Map([[7, { typeId: 7, unitPrice: 1000, contracts: 6 }]]);

describe('askEstimateFigure', () => {
  it('scales the unit ask by quantity and names N', () => {
    expect(askEstimateFigure({ type_id: 7, quantity: 2 }, estimates, 0, t)).toEqual({
      value: 2000,
      hint: 'assets.askEstimate.rowHint:1,000:6',
    });
  });
  it('stays out when the stack has a value or no estimate', () => {
    expect(askEstimateFigure({ type_id: 7, quantity: 1 }, estimates, 5, t)).toBeUndefined();
    expect(askEstimateFigure({ type_id: 8, quantity: 1 }, estimates, 0, t)).toBeUndefined();
  });
});

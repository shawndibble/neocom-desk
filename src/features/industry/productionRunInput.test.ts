import { describe, expect, it } from 'vitest';
import { validateProductionRunInput } from './productionRunInput';

describe('validateProductionRunInput', () => {
  it('flags quantity 0', () => {
    expect(validateProductionRunInput({ quantity: 0, materialCost: 1000, jobFee: 100 })).toEqual({
      quantity: true,
    });
  });

  it('flags both costs 0 with a positive quantity', () => {
    expect(validateProductionRunInput({ quantity: 5, materialCost: 0, jobFee: 0 })).toEqual({
      cost: true,
    });
  });

  it('flags quantity and cost together', () => {
    expect(validateProductionRunInput({ quantity: 0, materialCost: 0, jobFee: 0 })).toEqual({
      quantity: true,
      cost: true,
    });
  });

  it('accepts material cost 0 with a job fee', () => {
    expect(validateProductionRunInput({ quantity: 5, materialCost: 0, jobFee: 1000 })).toEqual({});
  });

  it('accepts job fee 0 with a material cost', () => {
    expect(validateProductionRunInput({ quantity: 5, materialCost: 1000, jobFee: 0 })).toEqual({});
  });

  it('accepts all positive', () => {
    expect(validateProductionRunInput({ quantity: 5, materialCost: 1000, jobFee: 100 })).toEqual(
      {}
    );
  });
});

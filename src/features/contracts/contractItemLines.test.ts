import { describe, expect, it } from 'vitest';
import { mergeContractItemLines, planSeedForLine } from './contractItemLines';
import type { PublicContractItem } from '@/esi/endpoints';

function item(overrides: Partial<PublicContractItem> & { record_id: number }): PublicContractItem {
  return {
    type_id: 40520,
    quantity: 1,
    is_included: true,
    ...overrides,
  };
}

describe('mergeContractItemLines', () => {
  it('adds up repeated lines of the same item into one', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 1, quantity: 1 }),
      item({ record_id: 2, quantity: 2 }),
      item({ record_id: 3, quantity: 2 }),
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
    expect(lines[0].sourceCount).toBe(3);
  });

  it('keeps what the issuer offers apart from what they ask for', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 1, type_id: 40520, quantity: 3 }),
      item({ record_id: 2, type_id: 40520, quantity: 4, is_included: false }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => [line.isIncluded, line.quantity])).toEqual([
      [true, 3],
      [false, 4],
    ]);
  });

  it('never merges blueprint copies, whose ME/TE/runs belong to the one copy', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 1, type_id: 1002, is_blueprint_copy: true, material_efficiency: 10 }),
      item({ record_id: 2, type_id: 1002, is_blueprint_copy: true, material_efficiency: 2 }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.materialEfficiency)).toEqual([10, 2]);
  });

  it('keeps a blueprint original out of the copy stack it shares a type with', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 1, type_id: 1002, is_blueprint_copy: true, runs: 30 }),
      item({ record_id: 2, type_id: 1002 }),
      item({ record_id: 3, type_id: 1002 }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0].isBlueprintCopy).toBe(true);
    expect(lines[1].quantity).toBe(2);
  });

  it('lists items in the order ESI first reported them', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 1, type_id: 34 }),
      item({ record_id: 2, type_id: 35 }),
      item({ record_id: 3, type_id: 34 }),
    ]);

    expect(lines.map((line) => line.typeId)).toEqual([34, 35]);
  });

  it('keys each line by the first ESI record it came from', () => {
    const lines = mergeContractItemLines([
      item({ record_id: 7, type_id: 34 }),
      item({ record_id: 9, type_id: 34 }),
    ]);

    expect(lines[0].key).toBe(7);
  });
});

describe('planSeedForLine', () => {
  it('seeds a Build Plan from a blueprint copy that reports all three numbers', () => {
    const [line] = mergeContractItemLines([
      item({
        record_id: 1,
        is_blueprint_copy: true,
        material_efficiency: 10,
        time_efficiency: 20,
        runs: 30,
      }),
    ]);

    expect(planSeedForLine(line)).toEqual({ me: 10, te: 20, runs: 30 });
  });

  it('gives no seed for a plain item', () => {
    const [line] = mergeContractItemLines([item({ record_id: 1 })]);

    expect(planSeedForLine(line)).toBeNull();
  });
});

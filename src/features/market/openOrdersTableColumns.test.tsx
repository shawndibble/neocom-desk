import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@/i18n';
import { useOpenOrderTableColumns } from './openOrdersTableColumns';

describe('useOpenOrderTableColumns', () => {
  it('has the advice columns by default', () => {
    const { result } = renderHook(() =>
      useOpenOrderTableColumns({ showCharacter: false, visible: [] })
    );
    expect(result.current.columns.map((c) => c.id)).toEqual([
      'item',
      'problem',
      'doThis',
      'iskTiedUp',
    ]);
  });

  it('drops the advice columns for the read-only corp view', () => {
    const { result } = renderHook(() =>
      useOpenOrderTableColumns({ showCharacter: false, visible: ['price'], workThrough: false })
    );
    expect(result.current.columns.map((c) => c.id)).toEqual(['item', 'price', 'iskTiedUp']);
    // A corp order is the corporation's, not "yours".
    expect(result.current.columns.find((c) => c.id === 'price')?.header).toBe('Price');
  });
});

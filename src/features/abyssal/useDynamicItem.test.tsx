import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { DynamicItemRecord } from '@/db';
import { useDynamicItem } from './useDynamicItem';

const RECORD = vi.hoisted<DynamicItemRecord>(() => ({
  itemId: 7,
  typeId: 47408,
  createdBy: 9,
  sourceTypeId: 1,
  mutatorTypeId: 2,
  attributes: [[6, 100]],
  savedAt: 0,
}));

vi.mock('./dynamicItems', () => ({ getDynamicItem: vi.fn(async () => RECORD) }));

describe('useDynamicItem', () => {
  it('reads the item for its own type', async () => {
    const { result } = renderHook(() => useDynamicItem(47408, 7));
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', record: RECORD }));
  });

  it('treats an item cached under another type as unreadable', async () => {
    const { result } = renderHook(() => useDynamicItem(47740, 7));
    await waitFor(() => expect(result.current).toEqual({ status: 'failed' }));
  });

  it('asks for nothing without an item id', () => {
    const { result } = renderHook(() => useDynamicItem(47408, undefined));
    expect(result.current).toEqual({ status: 'none' });
  });
});

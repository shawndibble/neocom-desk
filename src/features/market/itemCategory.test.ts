import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import type { TypeMap } from '@/sde/types';
import { loadItemCategoryId } from './itemCategory';

vi.mock('@/sde/loadSde', () => ({ loadTypes: vi.fn(), loadGroupCategories: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe('loadItemCategoryId', () => {
  it('reads a type’s category through its group', async () => {
    vi.mocked(loadTypes).mockResolvedValue({
      3481: { name: "Inherent Implants 'Noble' Hull Upgrades HG-1004", groupID: 738 },
    } as unknown as TypeMap);
    vi.mocked(loadGroupCategories).mockResolvedValue({ '738': 20 });
    await expect(loadItemCategoryId(3481)).resolves.toBe(20);
  });

  it('is null for a type the SDE lacks, or when it can’t load', async () => {
    vi.mocked(loadTypes).mockResolvedValue({} as TypeMap);
    vi.mocked(loadGroupCategories).mockResolvedValue({});
    await expect(loadItemCategoryId(1)).resolves.toBeNull();
    vi.mocked(loadTypes).mockRejectedValue(new Error('offline'));
    await expect(loadItemCategoryId(3481)).resolves.toBeNull();
  });
});

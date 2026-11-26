import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

export async function loadItemCategoryId(typeId: number): Promise<number | null> {
  try {
    const [types, categories] = await Promise.all([loadTypes(), loadGroupCategories()]);
    const groupId = types[String(typeId)]?.groupID;
    return groupId === undefined ? null : (categories[String(groupId)] ?? null);
  } catch {
    return null;
  }
}

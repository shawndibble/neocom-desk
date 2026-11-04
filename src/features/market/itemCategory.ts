/**
 * An item type's inventory category (`groupCategories.json`, through its
 * group in `types.json`): "Ship", "Implant"… Null, never a rejection, for a
 * type the SDE lacks or when the data can't load: callers treat it as context.
 */
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

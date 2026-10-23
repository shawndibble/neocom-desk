// characterTitles.json: ESI's `character_title_id` (a UUID) -> English title
// name, from CCP's `characterTitles.jsonl` (issue #4777).

/** `{uuid: name.en}` sorted by UUID; rows without a key or an English name are dropped. */
export function bakeCharacterTitles(records) {
  const byId = {};
  for (const r of records) {
    const name = r?.name?.en;
    if (typeof r?._key === 'string' && typeof name === 'string' && name.trim() !== '') {
      byId[r._key] = name;
    }
  }
  return Object.fromEntries(Object.entries(byId).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

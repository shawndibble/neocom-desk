/** `{character_title_id: name.en}` from CCP's characterTitles.jsonl (issue #4777), sorted by UUID; rows without a key or English name dropped. */
export function bakeCharacterTitles(records) {
  const entries = records
    .filter((r) => typeof r?._key === 'string' && typeof r?.name?.en === 'string')
    .map((r) => [r._key, r.name.en])
    .filter(([, name]) => name.trim() !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

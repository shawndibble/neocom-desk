// mutaplasmids.json: what each mutaplasmid does — the abyssal type it makes,
// the base modules (or drones) it applies to, and the range each attribute
// rolls in — from CCP's `dynamicItemAttributes.jsonl` (no Fuzzwork table
// carries it). `min`/`max` are multipliers on the base item's own value: a
// rolled module's attribute is base × a uniform pick in [min, max].
//
// `highIsGood` is resolved here, so the app never needs the dogma attribute
// table: the row's own override where CCP gives one (12 rows in build
// 3607705), else the attribute's. `attributeNames` maps each mutated
// attribute id to its internal dogma name (`capacitorNeed`), which is how
// Pyfa's EFT mutation blocks name them.

/**
 * @param {Array<{_key: number, attributeIDs: Array<{_key: number, min: number, max: number, highIsGood?: boolean}>, inputOutputMapping: Array<{applicableTypes: number[], resultingType: number}>}>} rows
 *   parsed `dynamicItemAttributes.jsonl` records
 * @param {Map<number, {name: string, highIsGood: boolean}>} attributes dogma attribute id -> internal name and direction
 */
export function bakeMutaplasmids(rows, attributes) {
  const mutaplasmids = {};
  const attributeNames = {};
  const abyssalTypeIds = new Set();
  for (const row of [...rows].sort((a, b) => a._key - b._key)) {
    if (row.inputOutputMapping?.length !== 1) {
      throw new Error(
        `Mutaplasmid ${row._key}: expected exactly one inputOutputMapping, got ${row.inputOutputMapping?.length ?? 0}`
      );
    }
    const [{ applicableTypes, resultingType }] = row.inputOutputMapping;
    const rolled = row.attributeIDs.map((a) => {
      const attribute = attributes.get(a._key);
      if (!attribute) throw new Error(`Mutaplasmid ${row._key}: unknown dogma attribute ${a._key}`);
      attributeNames[a._key] = attribute.name;
      return {
        id: a._key,
        min: a.min,
        max: a.max,
        highIsGood: a.highIsGood ?? attribute.highIsGood,
      };
    });
    mutaplasmids[row._key] = {
      result: resultingType,
      bases: [...applicableTypes].sort((a, b) => a - b),
      attributes: rolled.sort((a, b) => a.id - b.id),
    };
    abyssalTypeIds.add(resultingType);
  }
  return {
    attributeNames,
    mutaplasmids,
    abyssalTypeIds: [...abyssalTypeIds].sort((a, b) => a - b),
  };
}

/**
 * Dogma attribute id -> `{name, highIsGood}` from CCP's `dogmaAttributes.jsonl`
 * records — the second input `bakeMutaplasmids` takes. `name` is the internal
 * one (`capacitorNeed`), not the display name.
 */
export function dogmaAttributeInfo(records) {
  return new Map(
    records.map((r) => [r._key, { name: r.name, highIsGood: r.highIsGood !== false }])
  );
}

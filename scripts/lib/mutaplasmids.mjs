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

export function dogmaAttributeInfo(records) {
  return new Map(
    records.map((r) => [r._key, { name: r.name, highIsGood: r.highIsGood !== false }])
  );
}

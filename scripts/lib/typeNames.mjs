// typeNames.json: every type name the SDE knows, so a fit's item can be told
// apart as one CCP removed or one this app's other files just don't carry.
// types.json only carries the types a blueprint, skill or refine references,
// and market/types.json only published, market-grouped ones — an Abyssal
// filament or an LP booster has no blueprint, and a mutated (Abyssal) module
// has no market group. This list has no such filter, published or not.

/** Every non-blank name once, sorted. */
export function bakeTypeNames(names) {
  const kept = new Set();
  for (const name of names) if (typeof name === 'string' && name.trim() !== '') kept.add(name);
  return [...kept].sort();
}

/** The `names` that `typeNames` lacks, compared case-insensitively — as the EFT loader matches. */
export function namesMissingFrom(typeNames, names) {
  const known = new Set(typeNames.map((name) => name.toLowerCase()));
  return names.filter((name) => !known.has(name.toLowerCase()));
}

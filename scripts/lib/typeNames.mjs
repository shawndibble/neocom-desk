export function bakeTypeNames(names) {
  const kept = new Set();
  for (const name of names) if (typeof name === 'string' && name.trim() !== '') kept.add(name);
  return [...kept].sort();
}

export function namesMissingFrom(typeNames, names) {
  const known = new Set(typeNames.map((name) => name.toLowerCase()));
  return names.filter((name) => !known.has(name.toLowerCase()));
}

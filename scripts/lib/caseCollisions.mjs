// Find tracked paths that differ only in letter case. Linux CI tolerates them;
// macOS/Windows (case-insensitive) checkouts clobber one of the pair (#3890).
// Every path prefix is compared, so `Foo/a.ts` vs `foo/b.ts` collides on `Foo`/`foo`.
// Files in one folder also collide when their names match ignoring case once the last
// extension is dropped: `Foo.tsx` vs `foo.ts` is ambiguous to an extensionless import (#4579).

/** @param {string[]} paths @returns {string[][]} sorted groups of >=2 distinct spellings */
export function findCaseCollisions(paths) {
  const groups = [...findPathCollisions(paths), ...findStemCollisions(paths)];
  const seen = new Set();
  return groups
    .filter((g) => {
      const id = g.join('\0');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** @param {string[]} paths */
function findStemCollisions(paths) {
  const byStem = new Map();
  for (const p of new Set(paths)) {
    const slash = p.lastIndexOf('/');
    const name = p.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const key = `${p.slice(0, slash + 1)}${stem}`.normalize('NFC').toLowerCase();
    let entry = byStem.get(key);
    if (!entry) byStem.set(key, (entry = { stems: new Set(), files: [] }));
    entry.stems.add(stem.normalize('NFC'));
    entry.files.push(p);
  }
  return [...byStem.values()].filter((e) => e.stems.size > 1).map((e) => e.files.sort());
}

/** @param {string[]} paths */
function findPathCollisions(paths) {
  const byLower = new Map();
  for (const p of paths) {
    const parts = p.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      const key = prefix.normalize('NFC').toLowerCase();
      let spellings = byLower.get(key);
      if (!spellings) byLower.set(key, (spellings = new Set()));
      spellings.add(prefix);
    }
  }
  const colliding = new Set([...byLower].filter(([, s]) => s.size > 1).map(([k]) => k));
  return [...byLower]
    .filter(([key, s]) => {
      if (s.size < 2) return false;
      const slash = key.lastIndexOf('/');
      return slash < 0 || !colliding.has(key.slice(0, slash));
    })
    .map(([, s]) => [...s].sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

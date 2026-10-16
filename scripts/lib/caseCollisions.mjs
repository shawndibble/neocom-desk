// Find tracked paths that differ only in letter case. Linux CI tolerates them;
// macOS/Windows (case-insensitive) checkouts clobber one of the pair (#3890).
// Every path prefix is compared, so `Foo/a.ts` vs `foo/b.ts` collides on `Foo`/`foo`.

/** @param {string[]} paths @returns {string[][]} sorted groups of >=2 distinct spellings */
export function findCaseCollisions(paths) {
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

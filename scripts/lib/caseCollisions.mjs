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
      const key = prefix.toLowerCase();
      let spellings = byLower.get(key);
      if (!spellings) byLower.set(key, (spellings = new Set()));
      spellings.add(prefix);
    }
  }
  return [...byLower.values()]
    .filter((s) => s.size > 1)
    .map((s) => [...s].sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

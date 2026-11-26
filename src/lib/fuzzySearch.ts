export interface FuzzySearchOptions<T> {
  primary: (item: T) => string;
  limit: number;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      row.push(best);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

const MAX_QUERY_LENGTH = 40;

function allowedEdits(queryLength: number): number {
  if (queryLength <= 3) return 0;
  if (queryLength <= 5) return 1;
  if (queryLength <= 9) return 2;
  return 3;
}

function distanceToName(query: string, name: string, maxEdits: number): number {
  const candidates = [name, ...name.split(/[^a-z0-9]+/).filter(Boolean)];
  let best = Infinity;
  for (const candidate of candidates) {
    if (Math.abs(query.length - candidate.length) <= maxEdits) {
      best = Math.min(best, editDistance(query, candidate));
    }
    for (const length of [query.length - 1, query.length, query.length + 1]) {
      if (length > 0 && length < candidate.length) {
        best = Math.min(best, editDistance(query, candidate.slice(0, length)));
      }
    }
    if (best === 0) break;
  }
  return best;
}

export function fuzzySearch<T>(
  items: Iterable<T>,
  query: string,
  options: FuzzySearchOptions<T>
): T[] {
  const q = query.trim().toLowerCase();
  if (!q || q.length > MAX_QUERY_LENGTH) return [];
  const maxEdits = allowedEdits(q.length);

  const matches: { item: T; primaryText: string; distance: number }[] = [];
  for (const item of items) {
    const primaryText = options.primary(item);
    const distance = distanceToName(q, primaryText.toLowerCase(), maxEdits);
    if (distance <= maxEdits) matches.push({ item, primaryText, distance });
  }
  matches.sort((a, b) => a.distance - b.distance || a.primaryText.localeCompare(b.primaryText));
  return matches.slice(0, options.limit).map((match) => match.item);
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

export function blockedByRefs(body) {
  const m = /## Blocked by\s*\n([\s\S]*?)(\n## |$)/i.exec(body || '');
  if (!m) return [];
  const section = m[1].trim();
  if (!section || /^none\b/i.test(section)) return [];
  const items = [];
  let inItem = false;
  for (const line of section.split('\n')) {
    if (LIST_ITEM.test(line)) inItem = true;
    else if (!/^\s+\S/.test(line)) inItem = false;
    if (inItem) items.push(line);
  }
  const source = items.length > 0 ? items.join('\n') : section.split(/\n\s*\n/)[0];
  return [...source.matchAll(/#(\d+)/g)].map((mm) => Number(mm[1]));
}

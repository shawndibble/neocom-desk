// The issue numbers a ticket's `## Blocked by` section names
// (docs/agents/issue-tracker.md "Blocking edges"). Only the blockers count:
// the list items, or, for a section written inline without a list, its first
// paragraph. Prose after the list is not a blocker — a trailing "Parent idea:
// #5033" left #5150 waiting forever on an idea that is never scheduled.

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

/** @param {string | null | undefined} body */
export function blockedByRefs(body) {
  const m = /## Blocked by\s*\n([\s\S]*?)(\n## |$)/i.exec(body || '');
  if (!m) return [];
  const section = m[1].trim();
  if (!section || /^none\b/i.test(section)) return [];
  // A list item, and any indented line straight after one (an item wrapped onto
  // a continuation line), are blockers; a blank or unindented line ends the item.
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

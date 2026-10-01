// Pure bake behind build-sde.mjs's public/data/certifiedPlans.json (issue
// #2392): CCP's Certified Skill Plans, the career plans the client lists under
// Skill Plans > Certified Plans. They ship only in CCP's own JSONL static data
// export (`skillPlans.jsonl`); Fuzzwork's CSV dump has no equivalent table.
// Takes already-parsed records, so this is testable with small hand-made
// fixtures.

/** One JSON object per line; blank lines (a trailing newline, CRLF) skipped. */
export function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** `factions.jsonl` records -> Map of factionID to English name. */
export function factionNames(records) {
  const names = new Map();
  for (const record of records) {
    const name = record.name?.en;
    if (Number.isInteger(record._key) && typeof name === 'string' && name !== '') {
      names.set(record._key, name);
    }
  }
  return names;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/**
 * CCP's descriptions are client markup: `<br>` line breaks and `<a>` links to
 * `fitting:` and `localsvc:` URLs that mean nothing outside the client. Keep
 * the words, drop every tag, and decode the few entities CCP uses — the app
 * renders this as plain text, never as HTML.
 */
export function plainDescription(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name) => ENTITIES[name])
    .trim();
}

function isLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

/**
 * `skillPlans.jsonl` records -> the app's certified plan list, sorted by
 * career path then name.
 *
 * - A plan with no career path is dropped: the one such record is the "AIR"
 *   tutorial stub (three levels of Repair Systems), not a career plan.
 * - Entries keep CCP's order — it is a training route, prerequisites first.
 * - Entries and milestones naming a skill outside `skillTypeIds` are dropped:
 *   CCP's export and Fuzzwork's dump are separate builds and can disagree.
 * - Ship milestones (a typeID with no level) are dropped: a Plan Milestone
 *   anchors to a skill level, and a ship has none.
 * - A milestone the plan's own entries never reach is dropped, since it could
 *   only ever show as orphaned.
 */
export function bakeCertifiedPlans(records, skillTypeIds, factionNames) {
  const plans = [];
  for (const record of records) {
    if (!Number.isInteger(record.careerPathID)) continue;
    const entries = (record.skillRequirements ?? [])
      .filter((r) => skillTypeIds.has(r.typeID) && isLevel(r.level))
      .map((r) => ({ skillTypeID: r.typeID, level: r.level }));
    const trained = new Set(entries.map((e) => `${e.skillTypeID}:${e.level}`));
    const milestones = (record.milestones ?? [])
      .filter((m) => isLevel(m.level) && trained.has(`${m.typeID}:${m.level}`))
      .map((m) => ({ skillTypeID: m.typeID, level: m.level }));
    const plan = {
      id: record._key,
      name: record.name?.en ?? record.internalName ?? `Plan ${record._key}`,
      description: plainDescription(record.description?.en),
      careerPathId: record.careerPathID,
      entries,
      milestones,
    };
    if (Number.isInteger(record.factionID)) {
      plan.factionId = record.factionID;
      const factionName = factionNames.get(record.factionID);
      if (factionName) plan.factionName = factionName;
    }
    plans.push(plan);
  }
  return plans.sort((a, b) => a.careerPathId - b.careerPathId || a.name.localeCompare(b.name));
}

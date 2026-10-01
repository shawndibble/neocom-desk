// Pure bake behind build-sde.mjs's public/data/certificates.json (issue
// #2390): CCP's certificates for the combat groups, each a five-grade ladder
// of skill levels (Basic, Standard, Improved, Advanced, Elite) — the same
// ladders ship masteries are assembled from, kept whole here so the
// Certificates tab can grade a pilot by area rather than by hull. Read from
// CCP's JSONL export (`certificates.jsonl`, `groups.jsonl`), as the Certified
// Plans bake is.

import { plainDescription } from './certifiedPlans.mjs';

/**
 * The combat certificate groups, by groupID — matched by id, never by name,
 * so a CCP rename can't silently drop a group. Gunnery, Missiles, Drones,
 * Shields, Armor, Targeting, Navigation, Engineering, Electronic Systems.
 * Industry, science, trade, social and fleet-support certificates stay out
 * (issue #2390's hostile review: per-blueprint skill gates already answer
 * industry readiness).
 */
export const COMBAT_CERTIFICATE_GROUP_IDS = [255, 256, 273, 1209, 1210, 1213, 275, 1216, 272];

/**
 * CCP's grade names in grade order. Each skill's object lists its keys
 * alphabetically (advanced, basic, elite, …), so the order must come from
 * here, never from the object.
 */
const GRADES = ['basic', 'standard', 'improved', 'advanced', 'elite'];

function isLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

/**
 * `certificates.jsonl` records -> the combat certificates, each with
 * `levels`: five arrays (Basic..Elite) of `{ skillTypeID, level }`.
 *
 * - A level of 0 is CCP's "not needed at this grade" and is dropped.
 * - A skill outside `skillTypeIds` is dropped: CCP's export and Fuzzwork's
 *   dump are separate builds and can disagree.
 * - Sorted by group name, then certificate name.
 */
export function bakeCertificates(records, groupRecords, skillTypeIds) {
  const wanted = new Set(COMBAT_CERTIFICATE_GROUP_IDS);
  const groupNames = new Map(groupRecords.map((g) => [g._key, g.name?.en]));
  const certificates = [];
  for (const record of records) {
    if (!wanted.has(record.groupID)) continue;
    const skills = (record.skillTypes ?? []).filter((s) => skillTypeIds.has(s._key));
    const levels = GRADES.map((grade) =>
      skills.filter((s) => isLevel(s[grade])).map((s) => ({ skillTypeID: s._key, level: s[grade] }))
    );
    certificates.push({
      id: record._key,
      name: record.name?.en ?? `Certificate ${record._key}`,
      description: plainDescription(record.description?.en),
      groupId: record.groupID,
      groupName: groupNames.get(record.groupID) ?? `Group ${record.groupID}`,
      levels,
    });
  }
  return certificates.sort(
    (a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name)
  );
}

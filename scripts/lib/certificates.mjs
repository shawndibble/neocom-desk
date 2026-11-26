import { plainDescription } from './certifiedPlans.mjs';

export const COMBAT_CERTIFICATE_GROUP_IDS = [255, 256, 273, 1209, 1210, 1213, 275, 1216, 272];

const GRADES = ['basic', 'standard', 'improved', 'advanced', 'elite'];

function isLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

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

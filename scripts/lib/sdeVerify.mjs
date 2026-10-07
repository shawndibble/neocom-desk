// Pure comparison of CCP's live ESI type data against our baked entries (#2885).
// No network, no fs: scripts/sde-verify.mjs fetches, this decides.

const EPSILON = 1e-9;

const sameValue = (a, b) =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b))
    : a === b;

const ESI_FIELD = { name: 'name', groupID: 'group_id', volume: 'volume' };

/**
 * @param esiType  `/universe/types/{id}` payload
 * @param baked    { typeID, fields?: {name,groupID,volume}, attributes?: [{id,name?,value?,pinned?}] }
 * @param attributeNames  { [attributeId]: ESI attribute name }
 * @returns mismatches; `pinned` ones fail the run, the rest only print
 */
export function compareType(esiType, baked, attributeNames) {
  const out = [];
  const typeID = baked.typeID;
  for (const [key, expected] of Object.entries(baked.fields ?? {})) {
    const actual = esiType[ESI_FIELD[key]];
    if (!sameValue(expected, actual)) {
      out.push({ typeID, kind: 'value-mismatch', what: key, expected, actual, pinned: false });
    }
  }
  const byId = new Map((esiType.dogma_attributes ?? []).map((a) => [a.attribute_id, a.value]));
  for (const attr of baked.attributes ?? []) {
    const pinned = attr.pinned === true;
    const label = `attribute ${attr.id}${attr.name ? ` (${attr.name})` : ''}`;
    if (!byId.has(attr.id)) {
      out.push({
        typeID,
        kind: 'missing-attribute',
        what: label,
        expected: 'present',
        actual: 'absent',
        pinned,
      });
      continue;
    }
    const esiName = attributeNames[attr.id];
    if (attr.name && esiName !== undefined && esiName !== attr.name) {
      out.push({
        typeID,
        kind: 'wrong-attribute-name',
        what: `attribute ${attr.id}`,
        expected: attr.name,
        actual: esiName,
        pinned,
      });
    }
    if (attr.value !== undefined && !sameValue(attr.value, byId.get(attr.id))) {
      out.push({
        typeID,
        kind: 'value-mismatch',
        what: label,
        expected: attr.value,
        actual: byId.get(attr.id),
        pinned,
      });
    }
  }
  return out;
}

export function renderDiff(mismatches) {
  if (mismatches.length === 0) return 'No differences.';
  return mismatches
    .map(
      (m) =>
        `${m.pinned ? '[pinned] ' : ''}type ${m.typeID}: ${m.kind}: ${m.what}: baked ${m.expected}, ESI ${m.actual}`
    )
    .join('\n');
}

/**
 * What the scheduled workflow does with the `sde-drift` issue.
 * @param existingIssue  the open `sde-drift` issue ({number}) or null
 */
export function driftIssueAction(mismatches, existingIssue) {
  const pinned = mismatches.filter((m) => m.pinned);
  if (pinned.length === 0) {
    return existingIssue ? { action: 'close', number: existingIssue.number } : { action: 'none' };
  }
  const body = `Baked SDE data drifted from live ESI:\n\n\`\`\`\n${renderDiff(mismatches)}\n\`\`\``;
  return existingIssue
    ? { action: 'comment', number: existingIssue.number, body }
    : { action: 'create', body };
}

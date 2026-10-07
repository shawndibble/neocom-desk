#!/usr/bin/env node
// Compares sampled baked data against live ESI (#2885). Not a PR gate.
// Usage: node scripts/sde-verify.mjs [--report <file> [--existing <issue#>]]
// Exit 1 on mismatches in the pinned set; other differences only print.
// With --report, writes { mismatches, plan } (plan = driftIssueAction) for the
// scheduled workflow and always exits 0 so the workflow can act on it.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareType, driftIssueAction, renderDiff } from './lib/sdeVerify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESI = 'https://esi.evetech.tech';
const COMPATIBILITY_DATE = '2026-08-01';
const USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';
const SKILL_SAMPLE = 12;
const ORE_SAMPLE_IDS = [18, 19, 20, 21, 22];

const readJson = async (name) => JSON.parse(await readFile(join(ROOT, 'public', 'data', name)));

async function esiGet(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ESI + path, {
      headers: {
        Accept: 'application/json',
        'X-Compatibility-Date': COMPATIBILITY_DATE,
        'X-User-Agent': USER_AGENT,
      },
    });
    if ((res.status === 429 || res.status === 420) && attempt < 4) {
      const seconds = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, (Number.isFinite(seconds) ? seconds : 5) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    if (Number.isFinite(remaining) && remaining < 20) await new Promise((r) => setTimeout(r, 1000));
    return res.json();
  }
}

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const [skills, types] = await Promise.all([readJson('skills.json'), readJson('types.json')]);
const step = Math.max(1, Math.floor(skills.length / SKILL_SAMPLE));

const samples = [
  // Skill rank (attribute 275) vs the rank our SP math uses.
  ...skills
    .filter((_, i) => i % step === 0)
    .map((s) => ({
      typeID: s.typeID,
      fields: { name: s.name },
      attributes: [{ id: 275, name: 'skillTimeConstant', value: s.rank, pinned: true }],
    })),
  // Attribute ids we read, settled in the EVE Uni validation.
  { typeID: 3520, attributes: [{ id: 620, name: 'optimalSigRadius', pinned: true }] },
  { typeID: 3178, attributes: [{ id: 160, name: 'trackingSpeed', pinned: true }] },
  { typeID: 35836, attributes: [{ id: 2722, pinned: true }] },
  // Baked type fields; printed only.
  ...ORE_SAMPLE_IDS.filter((id) => types[id]).map((id) => ({
    typeID: id,
    fields: { name: types[id].name, groupID: types[id].groupID, volume: types[id].volume },
  })),
];

const attributeNames = {};
const mismatches = [];
for (const sample of samples) {
  const esiType = await esiGet(`/universe/types/${sample.typeID}`);
  for (const attr of sample.attributes ?? []) {
    if (attr.name && !(attr.id in attributeNames)) {
      attributeNames[attr.id] = (await esiGet(`/dogma/attributes/${attr.id}`)).name;
    }
  }
  mismatches.push(...compareType(esiType, sample, attributeNames));
}

console.log(`Checked ${samples.length} types.\n${renderDiff(mismatches)}`);

const reportPath = flag('--report');
if (reportPath) {
  const existing = flag('--existing');
  const plan = driftIssueAction(mismatches, existing ? { number: Number(existing) } : null);
  await writeFile(reportPath, JSON.stringify({ mismatches, plan }, null, 2));
} else if (mismatches.some((m) => m.pinned)) {
  process.exit(1);
}

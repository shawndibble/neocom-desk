#!/usr/bin/env node
// Build-time SDE pipeline: downloads Fuzzwork SDE CSVs, emits slim JSON for the app.
// Usage: node scripts/build-sde.mjs
// No deps; Node 24 built-ins only.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://www.fuzzwork.co.uk/dump/latest/csv/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'data');
// Default cache lives inside the repo (gitignored), not the world-shared
// /tmp: a shared tmpdir is writable by any local user/process, so a
// world-readable-and-writable cache dir there is a poisoning risk (another
// process could plant a malicious CSV at the exact cache path this script
// will trust on the next run). SDE_CACHE_DIR still overrides for CI/custom
// setups.
const CACHE_DIR = process.env.SDE_CACHE_DIR || join(ROOT, '.cache', 'sde');

const FILES = [
  'invTypes.csv',
  'invGroups.csv',
  'dgmTypeAttributes.csv',
  'industryActivity.csv',
  'industryActivityMaterials.csv',
  'industryActivityProducts.csv',
  'industryActivitySkills.csv',
];

// Dogma attribute IDs (verified against fuzzwork dgmAttributeTypes.csv):
// 275 skillTimeConstant (rank), 180 primaryAttribute, 181 secondaryAttribute
// requiredSkillN -> requiredSkillNLevel pairs:
// 182->277, 183->278, 184->279, 1285->1286, 1289->1287, 1290->1288 (verified: dgmAttributeTypes — 1287=requiredSkill5Level, 1288=requiredSkill6Level)
const RANK_ATTR = 275;
const PRIMARY_ATTR = 180;
const SECONDARY_ATTR = 181;
const PREREQ_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];
const CHAR_ATTR_NAMES = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower',
};
const SKILL_CATEGORY_ID = 16;
const MANUFACTURING_ACTIVITY_ID = 1;

async function download(name) {
  const cached = join(CACHE_DIR, name);
  try {
    const s = await stat(cached);
    if (s.size > 0) {
      console.log(`  ${name}: cache hit (${(s.size / 1048576).toFixed(1)} MB)`);
      return readFile(cached, 'utf8');
    }
  } catch {
    /* not cached */
  }
  const url = BASE_URL + name;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cached, text);
      console.log(`  ${name}: downloaded (${(text.length / 1048576).toFixed(1)} MB)`);
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(`  ${name}: attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// Minimal RFC-4180 CSV parser (handles quoted fields, "" escapes, embedded newlines, CRLF, BOM).
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function indexHeader(rows) {
  const header = rows[0];
  const idx = {};
  for (let i = 0; i < header.length; i++) idx[header[i]] = i;
  return idx;
}

function num(s) {
  return s === '' ? null : Number(s);
}

async function main() {
  console.log('Downloading SDE CSVs...');
  const raw = {};
  for (const f of FILES) raw[f] = parseCsv(await download(f));

  // --- invGroups: groupID -> {name, categoryID} ---
  const groups = new Map();
  {
    const rows = raw['invGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      groups.set(Number(r[h.groupID]), {
        name: r[h.groupName],
        categoryID: Number(r[h.categoryID]),
      });
    }
  }

  // --- invTypes: typeID -> {name, groupID, volume, published} ---
  const types = new Map();
  {
    const rows = raw['invTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      types.set(Number(r[h.typeID]), {
        name: r[h.typeName],
        description: r[h.description] ?? '',
        groupID: Number(r[h.groupID]),
        volume: num(r[h.volume]) ?? 0,
        published: r[h.published] === '1',
      });
    }
  }

  // --- Skill type IDs: published types whose group is in category 16 ---
  const skillTypeIds = new Set();
  for (const [typeID, t] of types) {
    if (!t.published) continue;
    const g = groups.get(t.groupID);
    if (g && g.categoryID === SKILL_CATEGORY_ID) skillTypeIds.add(typeID);
  }

  // --- dgmTypeAttributes: attrs for skill types only ---
  const attrsByType = new Map(); // typeID -> Map(attrID -> value)
  {
    const rows = raw['dgmTypeAttributes.csv'];
    const h = indexHeader(rows);
    const iType = h.typeID;
    const iAttr = h.attributeID;
    const iInt = h.valueInt;
    const iFloat = h.valueFloat;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const typeID = Number(r[iType]);
      if (!skillTypeIds.has(typeID)) continue;
      const value = r[iInt] !== '' ? Number(r[iInt]) : num(r[iFloat]);
      let m = attrsByType.get(typeID);
      if (!m) {
        m = new Map();
        attrsByType.set(typeID, m);
      }
      m.set(Number(r[iAttr]), value);
    }
  }

  // --- skills.json ---
  const skills = [];
  for (const typeID of [...skillTypeIds].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    const g = groups.get(t.groupID);
    const attrs = attrsByType.get(typeID) ?? new Map();
    const prereqs = [];
    for (const [skillAttr, levelAttr] of PREREQ_PAIRS) {
      const skillTypeID = attrs.get(skillAttr);
      if (skillTypeID == null) continue;
      prereqs.push({
        skillTypeID: Math.round(skillTypeID),
        level: Math.round(attrs.get(levelAttr) ?? 1),
      });
    }
    skills.push({
      typeID,
      name: t.name,
      description: t.description,
      groupID: t.groupID,
      groupName: g.name,
      rank: Math.round(attrs.get(RANK_ATTR) ?? 1),
      primaryAttr: CHAR_ATTR_NAMES[attrs.get(PRIMARY_ATTR)] ?? null,
      secondaryAttr: CHAR_ATTR_NAMES[attrs.get(SECONDARY_ATTR)] ?? null,
      prereqs,
    });
  }

  // --- blueprints.json (manufacturing only, published blueprints only) ---
  const bpTime = new Map();
  {
    const rows = raw['industryActivity.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.activityID]) !== MANUFACTURING_ACTIVITY_ID) continue;
      bpTime.set(Number(r[h.typeID]), Number(r[h.time]));
    }
  }
  const collectActivity = (fileName, idCol, qtyCol) => {
    const rows = raw[fileName];
    const h = indexHeader(rows);
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.activityID]) !== MANUFACTURING_ACTIVITY_ID) continue;
      const typeID = Number(r[h.typeID]);
      let list = map.get(typeID);
      if (!list) {
        list = [];
        map.set(typeID, list);
      }
      list.push({ typeID: Number(r[h[idCol]]), quantity: Number(r[h[qtyCol]]) });
    }
    return map;
  };
  const bpMaterials = collectActivity(
    'industryActivityMaterials.csv',
    'materialTypeID',
    'quantity'
  );
  const bpProducts = collectActivity('industryActivityProducts.csv', 'productTypeID', 'quantity');
  const bpSkills = new Map();
  {
    const rows = raw['industryActivitySkills.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.activityID]) !== MANUFACTURING_ACTIVITY_ID) continue;
      const typeID = Number(r[h.typeID]);
      let list = bpSkills.get(typeID);
      if (!list) {
        list = [];
        bpSkills.set(typeID, list);
      }
      list.push({ typeID: Number(r[h.skillID]), level: Number(r[h.level]) });
    }
  }

  const blueprints = {};
  for (const typeID of [...bpTime.keys()].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    if (!t || !t.published) continue; // strip unpublished blueprints
    const products = bpProducts.get(typeID);
    if (!products || products.length === 0) continue; // nothing manufactured
    blueprints[typeID] = {
      name: t.name,
      time: bpTime.get(typeID),
      materials: bpMaterials.get(typeID) ?? [],
      products,
      skills: bpSkills.get(typeID) ?? [],
    };
  }

  // --- types.json: every referenced typeID -> {name, groupID, volume} ---
  const referenced = new Set();
  for (const s of skills) {
    referenced.add(s.typeID);
    for (const p of s.prereqs) referenced.add(p.skillTypeID);
  }
  for (const [typeID, bp] of Object.entries(blueprints)) {
    referenced.add(Number(typeID));
    for (const m of bp.materials) referenced.add(m.typeID);
    for (const p of bp.products) referenced.add(p.typeID);
    for (const sk of bp.skills) referenced.add(sk.typeID);
  }
  const typeMap = {};
  for (const typeID of [...referenced].sort((a, b) => a - b)) {
    const t = types.get(typeID);
    if (!t) {
      console.warn(`  WARN: referenced typeID ${typeID} missing from invTypes`);
      continue;
    }
    typeMap[typeID] = { name: t.name, groupID: t.groupID, volume: t.volume };
  }

  // --- write outputs (compact) ---
  await mkdir(OUT_DIR, { recursive: true });
  const outputs = [
    ['skills.json', skills],
    ['blueprints.json', blueprints],
    ['types.json', typeMap],
  ];
  console.log('Writing outputs...');
  for (const [name, data] of outputs) {
    const json = JSON.stringify(data);
    const path = join(OUT_DIR, name);
    await writeFile(path, json);
    console.log(`  ${name}: ${Buffer.byteLength(json).toLocaleString()} bytes`);
  }

  // --- sanity checks ---
  console.log('Sanity checks...');
  const skillIds = new Set(skills.map((s) => s.typeID));
  let badPrereq = 0;
  let badRank = 0;
  let badAttrs = 0;
  for (const s of skills) {
    for (const p of s.prereqs) if (!skillIds.has(p.skillTypeID)) badPrereq++;
    if (!(s.rank >= 1 && s.rank <= 16)) badRank++;
    if (!s.primaryAttr || !s.secondaryAttr) badAttrs++;
  }
  console.log(`  skills: ${skills.length}`);
  console.log(`  blueprints (manufacturing): ${Object.keys(blueprints).length}`);
  console.log(`  types map entries: ${Object.keys(typeMap).length}`);
  console.log(`  prereqs pointing outside skills.json: ${badPrereq}`);
  console.log(`  skills with rank outside 1-16: ${badRank}`);
  console.log(`  skills missing primary/secondary attr: ${badAttrs}`);
  if (badPrereq || badRank || badAttrs) process.exitCode = 1;
}

main().catch((err) => {
  console.error('build-sde failed:', err);
  process.exit(1);
});

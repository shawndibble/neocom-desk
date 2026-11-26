#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/paths.mjs';

const BASE_URL = 'https://www.fuzzwork.co.uk/dump/latest/csv/';
const OUT_FILE = join(ROOT, 'public', 'data', 'fittingSlots.json');
const TYPES_FILE = join(ROOT, 'public', 'data', 'types.json');

const SLOT_EFFECT_ID = { 11: 'low', 12: 'high', 13: 'medium', 2663: 'rig', 3772: 'subsystem' };
const DRONE_CATEGORY_ID = 18;

async function fetchCsv(name) {
  const res = await fetch(BASE_URL + name);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
  return parseCsv(await res.text());
}

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
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows
    .slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => {
      const obj = {};
      for (const h of header) obj[h] = r[idx[h]];
      return obj;
    });
}

async function main() {
  console.log('Fetching dgmTypeEffects.csv, invGroups.csv, invCategories.csv...');
  const [typeEffects, groups, categories] = await Promise.all([
    fetchCsv('dgmTypeEffects.csv'),
    fetchCsv('invGroups.csv'),
    fetchCsv('invCategories.csv'),
  ]);

  const droneCategoryRow = categories.find((c) => Number(c.categoryID) === DRONE_CATEGORY_ID);
  if (!droneCategoryRow || droneCategoryRow.categoryName !== 'Drone') {
    throw new Error(`FAIL: categoryID ${DRONE_CATEGORY_ID} is not "Drone" in invCategories.csv`);
  }
  const droneGroupIds = new Set(
    groups.filter((g) => Number(g.categoryID) === DRONE_CATEGORY_ID).map((g) => Number(g.groupID))
  );

  const typesRaw = JSON.parse(await readFile(TYPES_FILE, 'utf8'));
  const catalogTypeIds = new Set(Object.keys(typesRaw).map(Number));

  const slotByTypeId = {};
  for (const row of typeEffects) {
    const slot = SLOT_EFFECT_ID[Number(row.effectID)];
    if (!slot) continue;
    const typeId = Number(row.typeID);
    if (!catalogTypeIds.has(typeId)) continue;
    slotByTypeId[typeId] ??= slot;
  }
  for (const [typeId, info] of Object.entries(typesRaw)) {
    if (droneGroupIds.has(Number(info.groupID))) slotByTypeId[Number(typeId)] = 'drone';
  }

  const count = Object.keys(slotByTypeId).length;
  console.log(`Resolved ${count} type ids to a slot.`);
  if (count < 3000 || count > 10000) {
    throw new Error(`FAIL: ${count} slotted types is outside the plausible 3000-10000 range`);
  }

  await writeFile(OUT_FILE, JSON.stringify(slotByTypeId));
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

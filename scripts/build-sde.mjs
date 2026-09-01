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
  'invMarketGroups.csv',
  'mapRegions.csv',
  'mapSolarSystems.csv',
  'staStations.csv',
];

const MARKET_OUT_DIR = join(OUT_DIR, 'market');

// Mirrors src/esi/client.ts's headers — a build-time probe is still an ESI
// client, and courtesy to CCP's API doesn't stop at the browser boundary.
const ESI_COMPATIBILITY_DATE = '2026-08-01';
const ESI_USER_AGENT = 'NeoCom Desk (github.com/shawndibble/neocom-desk)';
const ESI_BASE = 'https://esi.evetech.net';
const PROBE_CACHE_FILE = join(CACHE_DIR, 'market-regions-probe.json');
// Delve: canary region with no NPC station that still carries busy
// player-structure markets (CONTEXT.md — "31 nullsec regions have none").
const DELVE_REGION_ID = 10000060;
const MARKET_REGIONS_MIN = 78;
const MARKET_REGIONS_MAX = 116;
// A region whose every solar system sits within this many meters of the
// coordinate origin is not a place in the game universe — the nearest real
// system (Zarzakh) sits ~5.66e15 m out, ~5.7 billion times farther than this
// bound. GPMR-01, the region PLEX trades in, holds one such system (GPMS-01,
// position 1,1,1 — verified against Fuzzwork's mapSolarSystems.csv and ESI
// 2026-08-31): CCP synthesized it purely to hold a cluster-wide market, so it
// is a Global Market Region (CONTEXT.md round 12) rather than a place a
// picker should offer.
const SYNTHETIC_POSITION_MAX_M = 1_000_000;

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

const PROBE_MAX_RETRY_WAIT_MS = 10_000;

/** Mirrors src/esi/client.ts's retryWaitMs: Retry-After (429) or error-limit reset (420), capped. */
function probeRetryWaitMs(res) {
  const raw =
    res.status === 420
      ? res.headers.get('x-esi-error-limit-reset')
      : res.headers.get('retry-after');
  const seconds = raw === null ? NaN : Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 1000;
  return Math.min(Math.max(ms, 0), PROBE_MAX_RETRY_WAIT_MS);
}

/** Fetches one page of regionId's market-types listing, retrying on rate limits/errors. */
async function fetchMarketTypesPage(regionId, page) {
  const url = `${ESI_BASE}/markets/${regionId}/types/?page=${page}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          'X-User-Agent': ESI_USER_AGENT,
        },
      });
      // Respect ESI's rate limiting (429) and error-budget throttling (420):
      // wait exactly as long as the server asks before the one retry below.
      if (res.status === 429 || res.status === 420) {
        if (attempt === 3) throw new Error(`HTTP ${res.status} for ${url} (rate limited)`);
        await new Promise((r) => setTimeout(r, probeRetryWaitMs(res)));
        continue;
      }
      if (res.status === 404) return { typeIds: [], pages: 1 };
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      // Proactively back off well before the error budget runs out, rather
      // than waiting to be told — ~150 sequential probes is enough traffic
      // that a plain fetch loop could otherwise trip the limiter.
      const remaining = Number(res.headers.get('x-esi-error-limit-remain'));
      if (Number.isFinite(remaining) && remaining > 0 && remaining < 20) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      const body = await res.json();
      const pages = Number(res.headers.get('x-pages')) || 1;
      return { typeIds: Array.isArray(body) ? body : [], pages };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { typeIds: [], pages: 1 };
}

/** True if regionId's market-types listing (a lightweight endpoint) is non-empty. */
async function probeRegionHasMarket(regionId) {
  const { typeIds } = await fetchMarketTypesPage(regionId, 1);
  return typeIds.length > 0;
}

/** Every type ID with orders in regionId — used only for the handful of Global Market Regions. */
async function fetchAllMarketTypeIds(regionId) {
  const first = await fetchMarketTypesPage(regionId, 1);
  const typeIds = [...first.typeIds];
  for (let page = 2; page <= first.pages; page++) {
    typeIds.push(...(await fetchMarketTypesPage(regionId, page)).typeIds);
  }
  return typeIds;
}

/**
 * Probes every candidate region for a non-empty market-types listing rather
 * than trusting NPC-station presence or a hand-written exclusion list — 31
 * nullsec regions have no NPC station and still carry busy player-structure
 * markets, while wormhole/Abyssal/dev regions never carry orders at all
 * (CONTEXT.md). Results are cached to disk (like the CSV downloads), so
 * repeated local builds do not re-probe ~150 regions against ESI every time.
 */
async function probeMarketRegions(candidates) {
  let diskCache = {};
  try {
    diskCache = JSON.parse(await readFile(PROBE_CACHE_FILE, 'utf8'));
  } catch {
    /* no cache yet */
  }

  const result = [];
  const excluded = [];
  for (const region of candidates) {
    let hasMarket = diskCache[region.id];
    if (typeof hasMarket !== 'boolean') {
      hasMarket = await probeRegionHasMarket(region.id);
      diskCache[region.id] = hasMarket;
    }
    if (hasMarket) result.push(region);
    else excluded.push(region.name);
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(PROBE_CACHE_FILE, JSON.stringify(diskCache));

  console.log(`  market regions: ${result.length} carry orders, ${excluded.length} excluded`);
  console.log(`  excluded: ${excluded.join(', ')}`);
  return result;
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
        marketGroupID: r[h.marketGroupID] === '' ? null : Number(r[h.marketGroupID]),
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

  // --- market/groups.json: invMarketGroups -> MarketGroupNode[] ---
  const marketGroups = [];
  {
    const rows = raw['invMarketGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const parentRaw = r[h.parentGroupID];
      marketGroups.push({
        id: Number(r[h.marketGroupID]),
        name: r[h.marketGroupName],
        parentId: parentRaw === '' ? null : Number(parentRaw),
        hasTypes: r[h.hasTypes] === '1',
      });
    }
    marketGroups.sort((a, b) => a.id - b.id);
  }

  // --- market/types.json: published invTypes with a market group -> MarketTypeEntry[] ---
  const marketTypes = [];
  for (const [typeID, t] of types) {
    if (!t.published || t.marketGroupID == null) continue;
    marketTypes.push({ typeId: typeID, name: t.name, marketGroupId: t.marketGroupID });
  }
  marketTypes.sort((a, b) => a.typeId - b.typeId);

  // --- market/systems.json: mapSolarSystems -> SolarSystemEntry[] ---
  // Also tracks, per region, whether every one of its systems sits at a
  // synthetic (near-origin) position — see SYNTHETIC_POSITION_MAX_M.
  const solarSystems = [];
  const regionAllSystemsSynthetic = new Map();
  {
    const rows = raw['mapSolarSystems.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const regionId = Number(r[h.regionID]);
      solarSystems.push({
        id: Number(r[h.solarSystemID]),
        name: r[h.solarSystemName],
        security: num(r[h.security]) ?? 0,
        regionId,
      });
      const x = num(r[h.x]) ?? 0;
      const y = num(r[h.y]) ?? 0;
      const z = num(r[h.z]) ?? 0;
      const synthetic = Math.hypot(x, y, z) < SYNTHETIC_POSITION_MAX_M;
      regionAllSystemsSynthetic.set(
        regionId,
        synthetic && (regionAllSystemsSynthetic.get(regionId) ?? true)
      );
    }
    solarSystems.sort((a, b) => a.id - b.id);
  }
  const globalMarketRegionIds = new Set(
    [...regionAllSystemsSynthetic].filter(([, synthetic]) => synthetic).map(([id]) => id)
  );

  // --- market/stations.json: staStations -> NpcStationEntry[] ---
  const npcStations = [];
  {
    const rows = raw['staStations.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      npcStations.push({
        id: Number(r[h.stationID]),
        name: r[h.stationName],
        systemId: Number(r[h.solarSystemID]),
      });
    }
    npcStations.sort((a, b) => a.id - b.id);
  }

  // --- market/regions.json: mapRegions, probed live against ESI for orders ---
  const regionCandidates = [];
  {
    const rows = raw['mapRegions.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      regionCandidates.push({ id: Number(r[h.regionID]), name: r[h.regionName] });
    }
  }
  console.log(`Probing ${regionCandidates.length} regions against ESI for live orders...`);
  const regionsWithOrders = await probeMarketRegions(regionCandidates);
  const marketRegions = regionsWithOrders.filter((r) => !globalMarketRegionIds.has(r.id));
  const globalMarketRegions = regionsWithOrders.filter((r) => globalMarketRegionIds.has(r.id));

  // --- market/globalMarkets.json: which types trade in a Global Market
  // Region (CONTEXT.md round 12) instead of the normal regional books, and
  // where — read live per region, not hardcoded (only a handful of regions
  // qualify, so this is a few requests, not hundreds).
  console.log(
    `Reading traded items for ${globalMarketRegions.length} Global Market Region(s): ${globalMarketRegions.map((r) => r.name).join(', ') || '(none)'}`
  );
  const globalMarkets = [];
  for (const region of globalMarketRegions) {
    const typeIds = await fetchAllMarketTypeIds(region.id);
    for (const typeId of typeIds) {
      globalMarkets.push({ typeId, regionId: region.id, regionName: region.name });
    }
  }
  globalMarkets.sort((a, b) => a.typeId - b.typeId);

  // --- write outputs (compact) ---
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(MARKET_OUT_DIR, { recursive: true });
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
  const marketOutputs = [
    ['groups.json', marketGroups],
    ['types.json', marketTypes],
    ['systems.json', solarSystems],
    ['stations.json', npcStations],
    ['regions.json', marketRegions],
    ['globalMarkets.json', globalMarkets],
  ];
  for (const [name, data] of marketOutputs) {
    const json = JSON.stringify(data);
    const path = join(MARKET_OUT_DIR, name);
    await writeFile(path, json);
    console.log(`  market/${name}: ${Buffer.byteLength(json).toLocaleString()} bytes`);
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

  console.log(`  market groups: ${marketGroups.length}`);
  console.log(`  market types: ${marketTypes.length}`);
  console.log(`  solar systems: ${solarSystems.length}`);
  console.log(`  npc stations: ${npcStations.length}`);
  console.log(`  market regions: ${marketRegions.length}`);
  console.log(
    `  global market regions: ${globalMarketRegions.length} (${globalMarketRegions.map((r) => r.name).join(', ') || 'none'})`
  );
  console.log(`  globally-traded items: ${globalMarkets.length}`);
  if (
    marketGroups.length === 0 ||
    marketTypes.length === 0 ||
    solarSystems.length === 0 ||
    npcStations.length === 0 ||
    marketRegions.length === 0
  ) {
    console.error('  FAIL: a market payload came out empty');
    process.exitCode = 1;
  }
  if (!marketRegions.some((r) => r.id === DELVE_REGION_ID)) {
    console.error(
      '  FAIL: Delve (player-structure-only market, no NPC station) missing from market regions'
    );
    process.exitCode = 1;
  }
  if (marketRegions.length < MARKET_REGIONS_MIN || marketRegions.length > MARKET_REGIONS_MAX) {
    console.error(
      `  FAIL: market region count ${marketRegions.length} outside the plausible ${MARKET_REGIONS_MIN}-${MARKET_REGIONS_MAX} range`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('build-sde failed:', err);
  process.exit(1);
});

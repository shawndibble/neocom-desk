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
  'dgmAttributeTypes.csv',
  'dgmAttributeCategories.csv',
  'eveUnits.csv',
  'industryActivity.csv',
  'industryActivityMaterials.csv',
  'industryActivityProducts.csv',
  'industryActivitySkills.csv',
  'invMarketGroups.csv',
  'invMetaTypes.csv',
  'planetSchematics.csv',
  'planetSchematicsTypeMap.csv',
  'planetSchematicsPinMap.csv',
  'invMetaGroups.csv',
  'mapRegions.csv',
  'mapSolarSystems.csv',
  // Per-planet radius, for PI link cost (issue #440). Only the group-7 rows
  // are kept; see `piPlanetRadius` below.
  'mapDenormalize.csv',
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

// The eight values ESI reports for CharacterPlanet.planet_type (mirrors
// `PlanetType` in src/esi/endpoints.ts). P0_PLANET_TYPES is checked against
// this set so pi.json can never name a planet type a colony won't match.
const ESI_PLANET_TYPES = [
  'barren',
  'gas',
  'ice',
  'lava',
  'oceanic',
  'plasma',
  'storm',
  'temperate',
];

// --- Planetary pin infrastructure (pi.json's `infrastructure` block) ---
//
// Every number here is read out of the dump, not typed in: the CPU/Powergrid
// a pin draws and a Command Center supplies are ordinary dogma attributes.
// The one exception is CC_UPGRADE_LEVELS below, which is flagged as such.
const PLANET_GROUP_ID = 7;
const PI_PIN_GROUPS = {
  1027: 'commandCenter',
  1028: 'processor', // split into basic/advanced/highTech by name below
  1029: 'storage',
  1030: 'launchpad',
  1063: 'extractorControlUnit',
};
// Which Processor a name is. The three are separate pins with different costs,
// and the SDE has no column saying which is which, so the name is the only
// discriminator the dump offers. Checked for exhaustive coverage below.
const PROCESSOR_KINDS = [
  ['High-Tech Production Plant', 'highTech'],
  ['Advanced Industry Facility', 'advanced'],
  ['Basic Industry Facility', 'basic'],
];
const PIN_KINDS = ['extractorControlUnit', 'basic', 'advanced', 'highTech', 'storage', 'launchpad'];
// Dogma attribute IDs (verified against dgmAttributeTypes.csv):
const POWER_OUTPUT_ATTR = 11; // powerOutput, what a Command Center supplies
const POWER_LOAD_ATTR = 15; // powerLoad, what a pin draws
const CPU_OUTPUT_ATTR = 48; // cpuOutput
const CPU_LOAD_ATTR = 49; // cpuLoad
const PLANET_RESTRICTION_ATTR = 1632; // planetRestriction: the planet typeID a pin belongs to
const ECU_HEAD_CPU_ATTR = 1690; // ecuExtractorHeadCPU
const ECU_HEAD_POWER_ATTR = 1691; // ecuExtractorHeadPower
// The Link type (2280) and its own cost attributes. A link is a pin cost like
// any other, except its size depends on the distance between the two pins it
// joins — which is why per-planet radius has to ship alongside it.
const PI_LINK_TYPE_ID = 2280;
const LINK_POWER_PER_KM_ATTR = 1633; // powerLoadPerKm
const LINK_CPU_PER_KM_ATTR = 1634; // cpuLoadPerKm
const LINK_CPU_LEVEL_ATTR = 1635; // cpuLoadLevelModifier
const LINK_POWER_LEVEL_ATTR = 1636; // powerLoadLevelModifier

// CPU/Powergrid a Command Center supplies at each of its **own** upgrade
// levels, 0-5.
//
// Indexed by the colony's Command Center upgrade level — what ESI reports as
// `CharacterPlanet.upgrade_level`, per colony — and NOT by the pilot's
// Command Center Upgrades skill. The skill sets the *ceiling* a colony may be
// upgraded to; reaching each level is then bought per colony with ISK, which
// is why the wiki table this comes from prices every row. Confusing the two
// overstates the budget of every colony not upgraded to the pilot's maximum.
//
// UNLIKE THE PIN COSTS THIS TABLE IS NOT DERIVED FROM THE SDE DUMP. The skill
// (type 2505) carries no dogma effect that scales a deployed Command Center's
// output, so the per-level numbers are nowhere in the dump; a deployed CC's
// static attributes only ever show the level-0 profile. See
// docs/research/pi-cpu-power-mechanics.md §1-2 for the full trace.
//
// Source: EVE University wiki, "Planetary buildings" ("Command Center
// Properties"), https://wiki.eveuniversity.org/Planetary_buildings, read
// 2026-09-04. Levels 0 and 1 are independently corroborated by ESI's own
// live and legacy type data (2254 carries the level-0 row; the unpublished
// legacy "Limited Barren Command Center", 2129, carries the level-1 row
// exactly) — and those legacy types were themselves the separate deployable
// items each level used to correspond to, which is the other reason to read
// this as a per-colony upgrade rather than a per-character skill. Levels 2-5
// are secondary-source only.
//
// The level-0 row is asserted against the dump-derived Command Center output
// before anything is written, so a dump whose base numbers move fails the
// build instead of shipping a table that disagrees with its own first row.
const CC_UPGRADE_LEVELS = [
  { level: 0, cpu: 1675, powergrid: 6000 },
  { level: 1, cpu: 7057, powergrid: 9000 },
  { level: 2, cpu: 12136, powergrid: 12000 },
  { level: 3, cpu: 17215, powergrid: 15000 },
  { level: 4, cpu: 21315, powergrid: 17000 },
  { level: 5, cpu: 25415, powergrid: 19000 },
];

// Which planet types yield each P0 resource, keyed by invTypes.typeName.
//
// UNLIKE EVERYTHING ELSE IN THIS SCRIPT THIS TABLE IS NOT DERIVED FROM THE SDE
// DUMP — the relationship simply isn't in it, so this is hand-maintained and
// can drift out from under a `latest` dump without any download noticing.
// Source: EVE University wiki, "Planetary Commodities"
// (https://wiki.eveuniversity.org/Planetary_Commodities), read 2026-09-03.
//
// It answers "which planet types", never "how much": per-planet resource
// richness is visible only to a planet scanner, so it is not modelled at all
// and no payload can carry it. Coverage is asserted
// in both directions in the sanity checks below — an extracted P0 with no row
// here, or a row here matching no P0, fails the build instead of quietly
// emitting an empty list.
const P0_PLANET_TYPES = {
  'Aqueous Liquids': ['barren', 'gas', 'ice', 'oceanic', 'storm', 'temperate'],
  Autotrophs: ['temperate'],
  'Base Metals': ['barren', 'gas', 'lava', 'plasma', 'storm'],
  'Carbon Compounds': ['barren', 'oceanic', 'temperate'],
  'Complex Organisms': ['oceanic', 'temperate'],
  'Felsic Magma': ['lava'],
  'Heavy Metals': ['ice', 'lava', 'plasma'],
  'Ionic Solutions': ['gas', 'storm'],
  Microorganisms: ['barren', 'ice', 'oceanic', 'temperate'],
  'Noble Gas': ['gas', 'ice', 'storm'],
  'Noble Metals': ['barren', 'plasma'],
  'Non-CS Crystals': ['lava', 'plasma'],
  'Planktic Colonies': ['ice', 'oceanic'],
  'Reactive Gas': ['gas'],
  'Suspended Plasma': ['lava', 'plasma', 'storm'],
};

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
        // What the type holds, not what it takes up: a Launchpad's 10,000 m3
        // and a Storage Facility's 12,000 are the colony's whole buffer.
        capacity: num(r[h.capacity]) ?? 0,
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

  // --- Planetary pin type IDs: published types in the six pin groups ---
  const piPinTypeIds = new Set();
  for (const [typeID, t] of types) {
    if (t.published && PI_PIN_GROUPS[t.groupID]) piPinTypeIds.add(typeID);
  }

  // --- dgmTypeAttributes: attrs for skill types and planetary pins ---
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
      if (!skillTypeIds.has(typeID) && !piPinTypeIds.has(typeID) && typeID !== PI_LINK_TYPE_ID)
        continue;
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

  // --- pi.json: planetary industry schematics, keyed by the typeID they
  // produce. Item names ride along inside this payload rather than being
  // looked up in types.json: that map only carries types some blueprint or
  // skill references, and most planetary commodities are made by a schematic
  // and consumed by another one, so 42 of them are absent from it.
  //
  // Alongside the recipes it carries the colony's CPU/Powergrid budget and
  // the per-pin costs that budget pays for, so the pin-layout planner
  // (src/engine/pi/pinBudget.ts) can size a planet without hardcoding a
  // single game constant of its own.
  const piSchematics = {};
  const piRaw = [];
  let piUnpublished = 0;

  // Planet typeID -> the PlanetType string ESI reports for a colony. The
  // planet types are unpublished types in group 7 named "Planet (Temperate)"
  // and so on; several typeIDs share one planet type, and the ones ESI has no
  // colony string for (Shattered, Scorched Barren) are left out rather than
  // mapped to a plausible neighbour.
  const piPlanetTypeByTypeId = {};
  for (const [typeID, t] of types) {
    if (t.groupID !== PLANET_GROUP_ID) continue;
    const inner = /^Planet \((.+)\)$/.exec(t.name)?.[1]?.toLowerCase();
    if (inner && ESI_PLANET_TYPES.includes(inner)) piPlanetTypeByTypeId[typeID] = inner;
  }

  // Pin costs, keyed by kind. Every planet-type variant of a kind is read and
  // asserted to agree, so "one representative per kind" is a checked
  // conclusion rather than an assumption.
  const piPinKindOf = (t) => {
    const group = PI_PIN_GROUPS[t.groupID];
    if (group !== 'processor') return group;
    return PROCESSOR_KINDS.find(([suffix]) => t.name.endsWith(suffix))?.[1];
  };
  const piPinSpecs = {};
  const piPinKindByTypeId = {}; // pin typeID -> kind, for reading a live colony's own pins
  // Command Centers, which every colony has exactly one of. Deliberately not a
  // pin kind — a CC supplies the budget and draws nothing from it, so it has
  // no cost row to look up — but a reader of a live colony's pins still has to
  // recognise it, or it lands in "pins we don't recognise" on every colony.
  const piCommandCenterTypeIds = [];
  const piPinsByKind = new Map(); // kind -> [{ typeID, name, cpu, powergrid, capacity }]
  const piPinPlanetTypes = new Map(); // pin typeID -> PlanetType
  const piUnclassifiedPins = [];
  const piDisagreeingPins = [];
  let piCommandCenterOutput = null;
  let piExtractorHead = null;
  {
    for (const typeID of [...piPinTypeIds].sort((a, b) => a - b)) {
      const t = types.get(typeID);
      const attrs = attrsByType.get(typeID) ?? new Map();
      const planetTypeId = attrs.get(PLANET_RESTRICTION_ATTR);
      const planetType = piPlanetTypeByTypeId[planetTypeId];
      if (planetType) piPinPlanetTypes.set(typeID, planetType);

      if (PI_PIN_GROUPS[t.groupID] === 'commandCenter') {
        piCommandCenterTypeIds.push(typeID);
        // The Command Center supplies the budget and draws nothing from it —
        // it carries powerOutput/cpuOutput and no load attributes at all.
        const output = {
          cpu: attrs.get(CPU_OUTPUT_ATTR),
          powergrid: attrs.get(POWER_OUTPUT_ATTR),
        };
        if (output.cpu == null || output.powergrid == null) {
          piUnclassifiedPins.push(`${t.name} (${typeID}): no CPU/Powergrid output`);
        } else if (piCommandCenterOutput == null) {
          piCommandCenterOutput = output;
        } else if (
          piCommandCenterOutput.cpu !== output.cpu ||
          piCommandCenterOutput.powergrid !== output.powergrid
        ) {
          piDisagreeingPins.push(`${t.name} (${typeID}): Command Center output differs`);
        }
        continue;
      }

      const kind = piPinKindOf(t);
      if (!kind) {
        piUnclassifiedPins.push(`${t.name} (${typeID}): no pin kind`);
        continue;
      }
      const spec = {
        cpu: attrs.get(CPU_LOAD_ATTR),
        powergrid: attrs.get(POWER_LOAD_ATTR),
        capacity: t.capacity,
      };
      if (spec.cpu == null || spec.powergrid == null) {
        piUnclassifiedPins.push(`${t.name} (${typeID}): no CPU/Powergrid load`);
        continue;
      }
      const list = piPinsByKind.get(kind) ?? [];
      list.push({ typeID, name: t.name, ...spec });
      piPinsByKind.set(kind, list);
      piPinKindByTypeId[typeID] = kind;

      if (kind === 'extractorControlUnit') {
        const head = {
          cpu: attrs.get(ECU_HEAD_CPU_ATTR),
          powergrid: attrs.get(ECU_HEAD_POWER_ATTR),
        };
        if (head.cpu == null || head.powergrid == null) {
          piUnclassifiedPins.push(`${t.name} (${typeID}): no extractor-head CPU/Powergrid`);
        } else if (piExtractorHead == null) {
          piExtractorHead = head;
        } else if (
          piExtractorHead.cpu !== head.cpu ||
          piExtractorHead.powergrid !== head.powergrid
        ) {
          piDisagreeingPins.push(`${t.name} (${typeID}): extractor-head cost differs`);
        }
      }
    }
    for (const [kind, list] of piPinsByKind) {
      const [first, ...rest] = list;
      for (const other of rest) {
        if (
          other.cpu !== first.cpu ||
          other.powergrid !== first.powergrid ||
          other.capacity !== first.capacity
        ) {
          piDisagreeingPins.push(
            `${other.name} (${other.typeID}) disagrees with ${first.name} (${first.typeID}) on ${kind}`
          );
        }
      }
      piPinSpecs[kind] = { cpu: first.cpu, powergrid: first.powergrid, capacity: first.capacity };
    }
  }
  // Populated while walking the P0s, reported in the sanity checks below.
  const piUnmappedP0 = [];
  const piMappedP0Names = new Set();
  const piBadFacilities = [];
  {
    const meta = new Map();
    {
      const rows = raw['planetSchematics.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        meta.set(Number(r[h.schematicID]), {
          name: r[h.schematicName],
          cycleTime: Number(r[h.cycleTime]),
        });
      }
    }
    // One row per (schematic, type) pair; isInput splits the recipe's inputs
    // from the single type it produces.
    const schematicInputs = new Map();
    const schematicOutput = new Map();
    {
      const rows = raw['planetSchematicsTypeMap.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const schematicID = Number(r[h.schematicID]);
        const line = { typeID: Number(r[h.typeID]), quantity: Number(r[h.quantity]) };
        if (r[h.isInput] === '1') {
          const list = schematicInputs.get(schematicID) ?? [];
          list.push(line);
          schematicInputs.set(schematicID, list);
        } else {
          schematicOutput.set(schematicID, line);
        }
      }
    }
    // Which factory pin runs each schematic, straight out of the dump: one
    // row per (schematic, pin type) pair, one pin type per planet variant.
    // The facility kind and the planet types a schematic can run on both fall
    // out of it, so neither is inferred from the schematic's tier.
    const schematicPins = new Map();
    {
      const rows = raw['planetSchematicsPinMap.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const schematicID = Number(r[h.schematicID]);
        const list = schematicPins.get(schematicID) ?? [];
        list.push(Number(r[h.pinTypeID]));
        schematicPins.set(schematicID, list);
      }
    }
    const piName = (typeID) => types.get(typeID)?.name ?? `#${typeID}`;
    // invTypes.volume, not packagedVolume: the two are identical for every
    // planetary commodity (verified against the current dump) and `volume` is
    // the field the rest of this script already reads.
    const piVolume = (typeID) => types.get(typeID)?.volume ?? 0;
    for (const [schematicID, output] of schematicOutput) {
      const info = meta.get(schematicID);
      if (!info) continue;
      if (!types.get(output.typeID)?.published) {
        piUnpublished++;
        continue;
      }
      const pins = schematicPins.get(schematicID) ?? [];
      const facilities = [
        ...new Set(pins.map((pinTypeID) => piPinKindOf(types.get(pinTypeID) ?? {}))),
      ];
      if (facilities.length !== 1 || !facilities[0]) {
        piBadFacilities.push(`${info.name} (${schematicID}): ${JSON.stringify(facilities)}`);
      }
      piSchematics[output.typeID] = {
        schematicId: schematicID,
        name: info.name,
        cycleTime: info.cycleTime,
        quantity: output.quantity,
        volume: piVolume(output.typeID),
        facility: facilities[0] ?? null,
        planetTypes: [
          ...new Set(pins.map((pinTypeID) => piPinPlanetTypes.get(pinTypeID)).filter(Boolean)),
        ].sort(),
        inputs: (schematicInputs.get(schematicID) ?? [])
          .map((line) => ({ ...line, name: piName(line.typeID) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }
    // P0 resources have no schematic — they come out of an extractor — so
    // they are exactly the types that only ever appear on an input side.
    const rawIds = new Set();
    for (const list of schematicInputs.values()) {
      for (const line of list) if (!(line.typeID in piSchematics)) rawIds.add(line.typeID);
    }
    for (const typeID of [...rawIds].sort((a, b) => a - b)) {
      const name = piName(typeID);
      const planetTypes = P0_PLANET_TYPES[name];
      if (!planetTypes) {
        piUnmappedP0.push(`${name} (${typeID})`);
        continue;
      }
      piMappedP0Names.add(name);
      piRaw.push({ typeID, name, volume: piVolume(typeID), planetTypes: [...planetTypes].sort() });
    }
  }
  const piUnusedP0Rows = Object.keys(P0_PLANET_TYPES).filter((n) => !piMappedP0Names.has(n));
  const piBadPlanetTypes = [
    ...new Set(piRaw.flatMap((r) => r.planetTypes).filter((p) => !ESI_PLANET_TYPES.includes(p))),
  ];
  const piZeroVolume = [
    ...Object.entries(piSchematics)
      .filter(([, s]) => !(s.volume > 0))
      .map(([typeID]) => Number(typeID)),
    ...piRaw.filter((r) => !(r.volume > 0)).map((r) => r.typeID),
  ];
  const piMissingPinKinds = PIN_KINDS.filter((kind) => !piPinSpecs[kind]);
  // The hand-maintained CC-Upgrades table's own first row, checked against
  // what the dump says a Command Center supplies untrained. A dump whose base
  // numbers move fails the build rather than shipping a table that disagrees
  // with its own level 0 — the only row the SDE can vouch for.
  const piCcLevel0Mismatch =
    piCommandCenterOutput == null
      ? 'no Command Center output found in the dump'
      : piCommandCenterOutput.cpu !== CC_UPGRADE_LEVELS[0].cpu ||
          piCommandCenterOutput.powergrid !== CC_UPGRADE_LEVELS[0].powergrid
        ? `dump says ${piCommandCenterOutput.cpu} tf / ${piCommandCenterOutput.powergrid} MW, CC_UPGRADE_LEVELS[0] says ${CC_UPGRADE_LEVELS[0].cpu} / ${CC_UPGRADE_LEVELS[0].powergrid}`
        : null;
  // --- Link cost (issue #440) ---
  //
  // A link draws CPU and Powergrid like any other pin, but its cost has a
  // per-km term over the distance between the two pins it joins. Everything
  // here is read from the Link type's own dogma attributes; the distance
  // itself needs the planet's radius, emitted separately below.
  const piLink = (() => {
    const attrs = attrsByType.get(PI_LINK_TYPE_ID) ?? new Map();
    const spec = {
      cpu: attrs.get(CPU_LOAD_ATTR),
      powergrid: attrs.get(POWER_LOAD_ATTR),
      cpuPerKm: attrs.get(LINK_CPU_PER_KM_ATTR),
      powergridPerKm: attrs.get(LINK_POWER_PER_KM_ATTR),
      cpuLevelModifier: attrs.get(LINK_CPU_LEVEL_ATTR),
      powergridLevelModifier: attrs.get(LINK_POWER_LEVEL_ATTR),
    };
    return Object.values(spec).every((v) => typeof v === 'number') ? spec : null;
  })();

  // --- Per-planet radius, in km (issue #440) ---
  //
  // The one input the link formula needs that is not a dogma attribute, and
  // the reason it cannot be approximated: two colonies of identical shape cost
  // wildly different amounts purely because their planets differ in size (a
  // 6,030 km planet vs an 85,400 km one is a 6.7x difference in link cost).
  // `mapDenormalize` stores it in metres; km is what the per-km attributes are
  // denominated in, so the conversion happens once, here.
  const piPlanetRadiusKm = {};
  {
    const rows = raw['mapDenormalize.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.groupID]) !== PLANET_GROUP_ID) continue;
      const metres = Number(r[h.radius]);
      if (!Number.isFinite(metres) || metres <= 0) continue;
      // Rounded to the km the formula works in: sub-km precision on a body
      // thousands of km across cannot change a pin count, and the payload is
      // one entry per planet in New Eden.
      piPlanetRadiusKm[r[h.itemID]] = Math.round(metres / 1000);
    }
  }

  const piPlanetTypeCoverage = new Set(Object.values(piPlanetTypeByTypeId));
  const piMissingPlanetTypes = ESI_PLANET_TYPES.filter((p) => !piPlanetTypeCoverage.has(p));
  const pi = {
    schematics: piSchematics,
    raw: piRaw,
    infrastructure: {
      pins: Object.fromEntries(PIN_KINDS.map((kind) => [kind, piPinSpecs[kind]])),
      pinKindByTypeId: piPinKindByTypeId,
      commandCenterTypeIds: piCommandCenterTypeIds.sort((a, b) => a - b),
      extractorHead: piExtractorHead,
      link: piLink,
      commandCenterUpgrades: CC_UPGRADE_LEVELS,
    },
    planetTypeByTypeId: piPlanetTypeByTypeId,
  };

  // Structural invariants, checked BEFORE anything is written.
  //
  // The reporting checks further down set `process.exitCode = 1` but run after
  // the write, so on their own a failing build still leaves a bad payload on
  // disk — and `src/sde/types.ts` declares these fields non-nullable, so
  // `tsc` would go on vouching for a shape the emitter had just violated.
  // These throw instead: nothing is written unless the payload can satisfy
  // the types that describe it.
  {
    const problems = [];
    if (piCcLevel0Mismatch) problems.push(`Command Center level 0: ${piCcLevel0Mismatch}`);
    if (piBadFacilities.length)
      problems.push(
        `schematics whose factory pins resolve to more than one facility kind: ${piBadFacilities.join('; ')}`
      );
    if (piMissingPinKinds.length)
      problems.push(`no pin found for: ${piMissingPinKinds.join(', ')}`);
    if (piMissingPlanetTypes.length)
      problems.push(`no planet typeID maps to: ${piMissingPlanetTypes.join(', ')}`);
    if (!piCommandCenterTypeIds.length) problems.push('no Command Center types found');
    // Positive on both axes, not merely present. `engine/pi/pinBudget.ts`
    // refuses a pin priced at nothing rather than reading it as "no room",
    // and that refusal is a throw on a render path (`spareCapacity` runs
    // inside a card's `useMemo`). Guaranteeing it here is what keeps that
    // throw unreachable instead of a crash waiting on a payload regression.
    for (const [kind, spec] of Object.entries(pi.infrastructure.pins)) {
      if (!spec) {
        problems.push(`pin kind ${kind} has no cost row`);
      } else if (!(spec.cpu > 0) || !(spec.powergrid > 0)) {
        problems.push(
          `pin kind ${kind} is priced at ${spec.cpu} tf / ${spec.powergrid} MW; every pin costs something`
        );
      }
    }
    if (!(piExtractorHead?.cpu > 0) || !(piExtractorHead?.powergrid > 0)) {
      problems.push('extractor head is priced at nothing');
    }
    // A link costs something, and its per-km terms are the whole point of
    // shipping radius at all — a zero here would silently restore the
    // uncharged-link bug #440 exists to fix, with no warning anywhere.
    if (!piLink) {
      problems.push(`Link type ${PI_LINK_TYPE_ID} is missing one of its cost attributes`);
    } else {
      for (const [field, value] of Object.entries(piLink)) {
        if (!(value > 0)) problems.push(`link ${field} is ${value}; every term must be positive`);
      }
    }
    // Radius is per planet and cannot be approximated. An empty or tiny table
    // would make every colony's links look free.
    const radiusCount = Object.keys(piPlanetRadiusKm).length;
    if (radiusCount < 10_000) {
      problems.push(`only ${radiusCount} planet radii found; mapDenormalize looks wrong or empty`);
    }
    for (const [typeID, schematic] of Object.entries(piSchematics)) {
      if (!schematic.facility) problems.push(`schematic ${typeID} has no facility`);
      if (!schematic.planetTypes.length)
        problems.push(`schematic ${typeID} runs on no planet type`);
    }
    if (problems.length) {
      throw new Error(
        `pi.json would be structurally invalid, so nothing was written:\n  - ${problems.join('\n  - ')}`
      );
    }
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

  // --- market/variations.json: invMetaTypes + invMetaGroups -> Tech/Meta/
  // Faction variation relation (the EVE client's "Variations" tab). Every
  // classified type has an invMetaTypes row; a group's root has an empty
  // parentTypeID, and every other member's parentTypeID points at that root
  // (metaGroupID alone does not identify the root — some non-root rows are
  // also metaGroupID 1/Tech I). Filtered to published types so every id the
  // app resolves is guaranteed renderable, same discipline as marketTypes
  // above.
  const metaGroupNames = {};
  {
    const rows = raw['invMetaGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      metaGroupNames[Number(r[h.metaGroupID])] = r[h.metaGroupName];
    }
  }
  const variationTypes = {};
  {
    const rows = raw['invMetaTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const typeID = Number(r[h.typeID]);
      const t = types.get(typeID);
      if (!t || !t.published) continue;
      const parentRaw = r[h.parentTypeID];
      variationTypes[typeID] = {
        parentTypeId: parentRaw === '' ? null : Number(parentRaw),
        metaGroupId: Number(r[h.metaGroupID]),
      };
    }
  }
  const variations = { types: variationTypes, metaGroups: metaGroupNames };

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

  // --- market/attributes.json: dgmAttributeTypes -> attribute dictionary
  // (display name, unit, category), published only. Item Detail (CONTEXT.md
  // round 6) reads dogma_attributes live from ESI per item; this dictionary
  // is the small piece the snapshot carries instead, so attribute_ids become
  // readable without shipping every item's own attributes. An attribute with
  // no displayName is left out of the dictionary entirely, which is how the
  // app skips it rather than showing a raw identifier.
  const attributeCategoryNames = new Map();
  {
    const rows = raw['dgmAttributeCategories.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      attributeCategoryNames.set(Number(r[h.categoryID]), r[h.categoryName]);
    }
  }
  const unitDisplayNames = new Map();
  {
    const rows = raw['eveUnits.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      unitDisplayNames.set(Number(r[h.unitID]), r[h.displayName]);
    }
  }
  // categoryID 9 is CCP's own dumping ground for "attributes already checked
  // and not going into a category" — the CSV literally names it "NULL".
  const OTHER_ATTRIBUTE_CATEGORY = 'Other';
  const attributeDictionary = {};
  {
    const rows = raw['dgmAttributeTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[h.published] !== '1') continue;
      const displayName = r[h.displayName];
      if (!displayName) continue;
      const attributeID = Number(r[h.attributeID]);
      const unitID = r[h.unitID] === '' ? null : Number(r[h.unitID]);
      const categoryName = attributeCategoryNames.get(Number(r[h.categoryID]));
      attributeDictionary[attributeID] = {
        name: displayName,
        unit: unitID === null ? null : (unitDisplayNames.get(unitID) ?? null),
        category:
          !categoryName || categoryName === 'NULL' ? OTHER_ATTRIBUTE_CATEGORY : categoryName,
      };
    }
  }

  // --- write outputs (compact) ---
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(MARKET_OUT_DIR, { recursive: true });
  const outputs = [
    ['skills.json', skills],
    ['blueprints.json', blueprints],
    ['types.json', typeMap],
    ['pi.json', pi],
    // Its own file, not folded into pi.json: it is one entry per planet in New
    // Eden and every other consumer of pi.json would pay for it on load.
    ['pi-planet-radius.json', piPlanetRadiusKm],
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
    ['attributes.json', attributeDictionary],
    ['variations.json', variations],
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
  console.log(
    `  planetary schematics: ${Object.keys(piSchematics).length} (+${piRaw.length} raw resources, ${piUnpublished} unpublished skipped)`
  );
  console.log(
    `  planetary pins: ${[...piPinsByKind].map(([kind, list]) => `${kind} x${list.length}`).join(', ')}; ${Object.keys(piPlanetTypeByTypeId).length} planet typeIDs mapped`
  );
  if (Object.keys(piSchematics).length === 0 || piRaw.length === 0) {
    console.error('  FAIL: the planetary industry payload came out empty');
    process.exitCode = 1;
  }
  if (piUnmappedP0.length) {
    console.error(
      `  FAIL: P0 resources missing from P0_PLANET_TYPES: ${piUnmappedP0.join(', ')} — the wiki table this script cites has drifted`
    );
    process.exitCode = 1;
  }
  if (piUnusedP0Rows.length) {
    console.error(
      `  FAIL: P0_PLANET_TYPES rows matching no extracted resource: ${piUnusedP0Rows.join(', ')}`
    );
    process.exitCode = 1;
  }
  if (piBadPlanetTypes.length) {
    console.error(
      `  FAIL: planet types outside ESI's planet_type values: ${piBadPlanetTypes.join(', ')}`
    );
    process.exitCode = 1;
  }
  if (piZeroVolume.length) {
    console.error(`  FAIL: planetary types with no volume: ${piZeroVolume.join(', ')}`);
    process.exitCode = 1;
  }
  if (piUnclassifiedPins.length) {
    console.error(`  FAIL: planetary pins missing cost data: ${piUnclassifiedPins.join('; ')}`);
    process.exitCode = 1;
  }
  if (piDisagreeingPins.length) {
    console.error(
      `  FAIL: planet-type variants of one pin kind disagree on cost, so no representative can stand for the kind: ${piDisagreeingPins.join('; ')}`
    );
    process.exitCode = 1;
  }
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
  console.log(`  attribute dictionary entries: ${Object.keys(attributeDictionary).length}`);
  console.log(`  variation-classified types: ${Object.keys(variationTypes).length}`);
  console.log(`  meta groups: ${Object.keys(metaGroupNames).length}`);
  if (
    marketGroups.length === 0 ||
    marketTypes.length === 0 ||
    solarSystems.length === 0 ||
    npcStations.length === 0 ||
    marketRegions.length === 0 ||
    Object.keys(attributeDictionary).length === 0 ||
    Object.keys(variationTypes).length === 0 ||
    Object.keys(metaGroupNames).length === 0
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

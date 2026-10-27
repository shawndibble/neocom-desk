#!/usr/bin/env node
// Seeds a sample Corp Tax Book into the local Firebase emulator (issue #4190,
// epic #4055) so the officer /corp/moons page, the personal tab and the verify
// page can be checked in a browser without deploying anything. It writes the
// exact layout functions/src/corpTaxBookStore.ts writes (read that file when
// the schema changes), through the admin SDK against FIRESTORE_EMULATOR_HOST.
//
//   node scripts/dev/seed-corp-tax-book.mjs --corp 98000001 --corp-name "Moon Tax Corp" \
//     --officer 90000001 --member 90000002 [--guest 90000003] [--owner-hash <hash>] [--port 5173]
//
// Refuses to run unless FIRESTORE_EMULATOR_HOST is set or defaults to the
// emulator port in firebase.json; it can never reach production Firestore.

import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(
  fileURLToPath(new URL('../../functions/package.json', import.meta.url))
);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const { values: args } = parseArgs({
  options: {
    corp: { type: 'string' },
    'corp-name': { type: 'string', default: 'Dev Moon Mining Corp' },
    officer: { type: 'string' },
    'officer-name': { type: 'string', default: 'Dev Officer' },
    'owner-hash': { type: 'string', default: 'dev-owner-hash' },
    member: { type: 'string' },
    'member-name': { type: 'string', default: 'Dev Member' },
    guest: { type: 'string' },
    project: { type: 'string', default: 'demo-neocom-desk' },
    port: { type: 'string', default: '5173' },
  },
});

function requireId(name) {
  const n = Number(args[name]);
  if (!Number.isSafeInteger(n) || n <= 0) {
    console.error(
      'Usage: node scripts/dev/seed-corp-tax-book.mjs --corp <id> [--corp-name <name>] --officer <characterId>\n' +
        '         --member <characterId> [--guest <characterId>] [--owner-hash <hash>] [--port <vite port>]'
    );
    process.exit(1);
  }
  return n;
}
const CORP = requireId('corp');
const OFFICER = requireId('officer');
const MEMBER = requireId('member');
const GUEST = args.guest === undefined ? null : requireId('guest');
const CORP_NAME = args['corp-name'];

const host = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
  console.error(`Refusing to seed ${host}: FIRESTORE_EMULATOR_HOST must be a local emulator.`);
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST = host;
initializeApp({ projectId: args.project });
const db = getFirestore();

// --- Time ------------------------------------------------------------------
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const day = (back) => iso(NOW - back * DAY).slice(0, 10);

// --- Fixtures --------------------------------------------------------------
const REFINERIES = [
  { id: 1040000000001, name: 'Dev Athanor Alpha', solarSystemId: 30002187, moonId: 40139001 },
  { id: 1040000000002, name: 'Dev Tatara Beta', solarSystemId: 30002187, moonId: 40139002 },
];
// R4 moon ores: Zeolites, Sylvite, Bitumens. Prices are per raw unit.
const ORES = [
  { typeId: 45490, price: 1200 },
  { typeId: 45491, price: 1500 },
  { typeId: 45492, price: 1000 },
];
const RATE_PCT = 5;
const START = day(40);
const STATEMENT_DAYS = [12, 11, 10, 9, 8]; // billed on the issued Statement
const OPEN_DAYS = [7, 6, 5, 4, 3, 2, 1]; // still Billable

const book = db.collection('corps').doc(String(CORP));
const sub = (name) => book.collection(name);
const writes = []; // [ref, data]
const put = (ref, data) => writes.push([ref, data]);

// --- Book settings (BOOK_DEFAULTS + defaultSettings + turnOn fields) --------
put(book, {
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 6,
  minimumStatement: 5_000_000,
  overdueDays: 14,
  divisions: [1],
  cadence: { kind: 'monthly' },
  startDate: START,
  structureExpiryHours: {},
  rates: [{ scope: 'corp', pct: RATE_PCT, effectiveFrom: START }],
  corporationId: CORP,
  active: true,
  ownerCharacterId: OFFICER,
  createdAt: NOW - 40 * DAY,
  createdBy: OFFICER,
  lastSync: { at: NOW - HOUR, byCharacterId: OFFICER, byName: args['officer-name'], gaps: [] },
  schemaVersion: 1,
});

// --- Officer access (what verifyOfficer writes; rules read it for 24h) -------
put(sub('officers').doc(`char:${OFFICER}`), {
  isCeo: true,
  isDirector: true,
  isStationManager: true,
  canView: true,
  canEdit: true,
  characterId: OFFICER,
  characterName: args['officer-name'],
  ownerHash: args['owner-hash'],
  corporationId: CORP,
  roles: ['Director'],
  checkedAt: NOW,
  expiresAt: NOW + 24 * HOUR,
});

// --- Observed Mining Entries -------------------------------------------------
const minedQty = (charId, dayBack, ore, structure) =>
  8_000 + ((charId + dayBack * 7 + ore.typeId + structure.id) % 9) * 2_500;

function observedRows(charId, corporationId, dayBacks) {
  const rows = [];
  for (const back of dayBacks) {
    const structure = REFINERIES[back % REFINERIES.length];
    for (const ore of ORES) {
      rows.push({
        structureId: structure.id,
        characterId: charId,
        recordedCorporationId: corporationId,
        typeId: ore.typeId,
        date: day(back),
        quantity: minedQty(charId, back, ore, structure),
        cachedAt: iso(NOW - back * DAY + 20 * HOUR),
        solarSystemId: structure.solarSystemId,
        moonId: structure.moonId,
      });
    }
  }
  return rows;
}
const memberRows = observedRows(MEMBER, CORP, [...STATEMENT_DAYS, ...OPEN_DAYS]);
const guestRows = GUEST === null ? [] : observedRows(GUEST, 98999999, [6, 5, 4, 3]);
const officerRows = observedRows(OFFICER, CORP, [4, 3, 2]);
for (const r of [...memberRows, ...guestRows, ...officerRows]) {
  put(sub('observed').doc(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`), {
    ...r,
    uid: `char:${r.characterId}`,
  });
}

// --- An issued, unpaid Statement for the member (with verify link) -----------
const statementId = `st-${MEMBER}-1`;
const minerId = `solo:${MEMBER}`;
const lines = [];
for (const back of STATEMENT_DAYS) {
  const structure = REFINERIES[back % REFINERIES.length];
  const dayRows = memberRows.filter((r) => r.date === day(back));
  const value = dayRows.reduce(
    (sum, r) => sum + r.quantity * ORES.find((o) => o.typeId === r.typeId).price,
    0
  );
  lines.push({
    kind: 'mined',
    date: day(back),
    chargeKey: `${MEMBER}:${structure.id}:${day(back)}`,
    characterId: MEMBER,
    structureId: structure.id,
    oreLines: dayRows.map((r) => ({ typeId: r.typeId, quantity: r.quantity })),
    unitPrices: Object.fromEntries(ORES.map((o) => [o.typeId, o.price])),
    priceSources: Object.fromEntries(ORES.map((o) => [o.typeId, 'historical'])),
    taxPct: RATE_PCT,
    rateEffectiveFrom: START,
    estimatedValue: value,
    tax: Math.round((value * RATE_PCT) / 100),
  });
}
const amount = lines.reduce((sum, l) => sum + l.tax, 0);
const token = randomBytes(32).toString('base64url');
put(sub('statements').doc(statementId), {
  id: statementId,
  minerId,
  code: 'NTX-D3V1',
  periodStart: day(12),
  periodEnd: day(8),
  coversFrom: day(12),
  coversThrough: day(8),
  issuedAt: iso(NOW - 6 * DAY),
  hubId: 'jita',
  oreForm: 'compressed',
  lines,
  amount,
  characterIds: [MEMBER],
  corporationName: CORP_NAME,
  minerName: args['member-name'],
  refineryNames: Object.fromEntries(REFINERIES.map((r) => [String(r.id), r.name])),
  uids: [`char:${MEMBER}`],
  remindersStopped: false,
  manualRemindersSent: 0,
  issuedBy: OFFICER,
});
put(sub('statementLinks').doc(statementId), { verifyToken: token });
put(db.collection('corpTaxBookTokens').doc(token), {
  corporationId: CORP,
  statementId,
  minerId,
  remindersStopped: false,
  createdAt: NOW - 6 * DAY,
});

// --- Tax Payments: matched, Unmatched, not tax, manual ----------------------
const donation = (refId, characterId, amountIsk, back, extra = {}) => ({
  id: `j1_${refId}`,
  source: 'donation',
  characterId,
  uid: `char:${characterId}`,
  amount: amountIsk,
  at: iso(NOW - back * DAY),
  division: 1,
  ...extra,
});
const payments = [
  // Matched: the member's code, pinned to the Statement.
  donation(900001, MEMBER, Math.round(amount / 3), 4, {
    reason: 'NTX-D3V1',
    minerId,
    statementId,
  }),
  // Unmatched: no code, no Miner (the guest's if given, else the officer's).
  donation(900002, GUEST ?? OFFICER, 2_500_000, 3, { reason: 'moon tax' }),
  // Not tax: the member's, an officer marked it as something else.
  donation(900003, MEMBER, 40_000_000, 5, {
    notTaxAmount: 40_000_000,
    notTaxReason: 'Contract payment, not moon tax',
    notTaxBy: OFFICER,
    notTaxAt: iso(NOW - 4 * DAY),
  }),
];
for (const p of payments) put(sub('payments').doc(p.id), p);
put(sub('payments').doc('manual-dev-1'), {
  id: 'manual-dev-1',
  source: 'manual',
  minerId,
  characterId: MEMBER,
  uid: `char:${MEMBER}`,
  amount: 500_000,
  at: iso(NOW - 2 * DAY),
  statementId,
  note: 'Paid in person',
  recordedBy: OFFICER,
});

// --- A dismissal (one open day of the member's) and a declaration ------------
const dismissedKey = `${MEMBER}:${REFINERIES[3 % REFINERIES.length].id}:${day(3)}`;
put(sub('dismissals').doc('d-dev-1'), {
  id: 'd-dev-1',
  scope: 'record',
  targetId: dismissedKey,
  by: OFFICER,
  at: iso(NOW - 2 * DAY),
  reason: 'Corp fleet op: tax waived',
  uids: [`char:${MEMBER}`],
  amountIsk: 1_000_000,
});
put(sub('declarations').doc('x-dev-1'), {
  id: 'x-dev-1',
  statementId,
  kind: 'contract',
  at: iso(NOW - 1 * DAY),
  recordedBy: OFFICER,
  note: 'Says it was paid by contract',
});

// --- Extractions: Extracting, Ready, Fractured, Expired ----------------------
function extraction(structure, startedAgoH, arrivesInH, decaysInH, laserAgoH) {
  const start = NOW - startedAgoH * HOUR;
  const startIso = iso(start);
  const fields = {
    structureId: structure.id,
    moonId: structure.moonId,
    extractionStartTime: startIso,
    chunkArrivalTime: iso(NOW + arrivesInH * HOUR),
    naturalDecayTime: iso(NOW + decaysInH * HOUR),
    id: `${structure.id}_${Date.parse(startIso)}`,
  };
  if (laserAgoH !== undefined) fields.laserFiredAt = iso(NOW - laserAgoH * HOUR);
  put(sub('extractions').doc(fields.id), fields);
}
extraction(REFINERIES[0], 24, 72, 120); // Extracting: chunk lands in 3 days
extraction(REFINERIES[1], 120, -2, 46); // Ready: arrived, not yet fractured
extraction(REFINERIES[0], 200, -80, -30, 30); // Fractured: laser 30h ago, expires after 48h
extraction(REFINERIES[1], 400, -300, -250); // Expired: fractured 250h ago

// --- Audit trail (what turnOn and issueStatement append) ---------------------
function audit(at, action, detail) {
  put(sub('audit').doc(`${String(at).padStart(15, '0')}~${randomBytes(6).toString('base64url')}`), {
    at,
    by: OFFICER,
    byName: args['officer-name'],
    action,
    detail,
  });
}
audit(NOW - 40 * DAY, 'turnOn', { startDate: START, startRatePct: RATE_PCT });
audit(NOW - 6 * DAY, 'issueStatement', { statementId, minerId, amount });

// --- Write ---------------------------------------------------------------------
// Clear any earlier seed of this book through the emulator's own wipe endpoint.
await fetch(`http://${host}/emulator/v1/projects/${args.project}/databases/(default)/documents`, {
  method: 'DELETE',
});
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
  await batch.commit();
}

console.log(`Seeded corp ${CORP} (${CORP_NAME}) into ${host}: ${writes.length} documents.`);
console.log(`Officer ${OFFICER}, member ${MEMBER}${GUEST === null ? '' : `, guest ${GUEST}`}.`);
console.log(`Verify URL: http://localhost:${args.port}/corp-tax-book/verify/${token}`);

#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
    extra: { type: 'string', default: '12' },
    project: { type: 'string', default: 'demo-neocom-desk' },
    port: { type: 'string', default: '5173' },
    players: { type: 'boolean', default: false },
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

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const day = (back) => iso(NOW - back * DAY).slice(0, 10);

const SYSTEMS = [30002187, 30002053, 30000144];
const REFINERIES = Array.from({ length: 6 }, (_, i) => ({
  id: 1040000000001 + i,
  name: `Dev ${i % 2 === 0 ? 'Athanor' : 'Tatara'} ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'][i]}`,
  solarSystemId: SYSTEMS[i % 3],
  moonId: 40139001 + i,
}));
const ORES = [
  { typeId: 45490, price: 1200 },
  { typeId: 45491, price: 1500 },
  { typeId: 45492, price: 1000 },
];
const RATE_PCT = 5;
const START = day(40);
const NOTICE_DAYS = [12, 11, 10, 9, 8];
const OPEN_DAYS = [7, 6, 5, 4, 3, 2, 1];

const book = db.collection('corps').doc(String(CORP));
const sub = (name) => book.collection(name);
const writes = [];
const put = (ref, data) => writes.push([ref, data]);

put(book, {
  hubId: 'jita',
  oreForm: 'compressed',
  graceHours: 6,
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

const EXTRA_MINERS = Number(args.extra);
if (!Number.isInteger(EXTRA_MINERS) || EXTRA_MINERS < 0) {
  console.error('--extra must be a whole number, 0 or more.');
  process.exit(1);
}
const MINERS = [
  {
    id: MEMBER,
    name: args['member-name'],
    corp: CORP,
    days: [...NOTICE_DAYS, ...OPEN_DAYS],
    pays: 'third',
  },
  ...(GUEST === null
    ? []
    : [{ id: GUEST, name: 'Dev Guest', corp: 98999999, days: [6, 5, 4, 3], pays: 'none' }]),
  { id: OFFICER, name: args['officer-name'], corp: CORP, days: [4, 3, 2], pays: 'none' },
  ...Array.from({ length: EXTRA_MINERS }, (_, i) => ({
    id: 90_001_000 + i,
    name: `Dev Miner ${i + 1}`,
    corp: i % 5 === 4 ? 98_999_000 + i : CORP,
    days:
      i % 3 === 0
        ? [...NOTICE_DAYS, ...OPEN_DAYS]
        : i % 3 === 1
          ? [...NOTICE_DAYS, 3, 2]
          : [9, 8, 4, 3, 1],
    pays: ['full', 'partial', 'none', 'over', 'full', 'none'][i % 6],
  })),
];

const minedQty = (charId, dayBack, ore, structure) =>
  8_000 + ((charId + dayBack * 7 + ore.typeId + structure.id) % 9) * 2_500;

function observedRows(charId, corporationId, dayBacks) {
  const rows = [];
  for (const back of dayBacks) {
    const structure = REFINERIES[(back + charId) % REFINERIES.length];
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
for (const m of MINERS) m.rows = observedRows(m.id, m.corp, m.days);
for (const r of MINERS.flatMap((m) => m.rows)) {
  put(sub('observed').doc(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`), {
    ...r,
    uid: `char:${r.characterId}`,
  });
}

const NOTICE_ID_FIELD = 'statementId';
const paymentCode = (seed) => {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `MT${h.toString(36).toUpperCase().padStart(7, '0').slice(-6)}`;
};
const minerPaymentCode = (minerId) => paymentCode(`miner:${minerId}`);
const noticeOf = new Map();
let token = '';
for (const m of MINERS) {
  const billed = NOTICE_DAYS.filter((back) => m.days.includes(back)).reverse();
  if (billed.length === 0) continue;
  const noticeId = `ln-${m.id}-1`;
  const minerId = `solo:${m.id}`;
  const lines = billed.map((back) => {
    const dayRows = m.rows.filter((r) => r.date === day(back));
    const structure = REFINERIES.find((s) => s.id === dayRows[0].structureId);
    const value = dayRows.reduce(
      (sum, r) => sum + r.quantity * ORES.find((o) => o.typeId === r.typeId).price,
      0
    );
    return {
      kind: 'mined',
      date: day(back),
      key: `${m.id}:${structure.id}:${day(back)}`,
      characterId: m.id,
      structureId: structure.id,
      oreLines: dayRows.map((r) => ({ typeId: r.typeId, quantity: r.quantity })),
      unitPrices: Object.fromEntries(ORES.map((o) => [o.typeId, o.price])),
      priceSources: Object.fromEntries(ORES.map((o) => [o.typeId, 'historical'])),
      taxPct: RATE_PCT,
      rateEffectiveFrom: START,
      estimatedValue: value,
      tax: Math.round((value * RATE_PCT) / 100),
    };
  });
  const amount = lines.reduce((sum, l) => sum + l.tax, 0);
  const notice = {
    id: noticeId,
    minerId,
    characterIds: [m.id],
    kind: 'late',
    issuedAt: iso(NOW - 6 * DAY),
    issuedBy: OFFICER,
    code: minerPaymentCode(minerId),
    pricing: { hubId: 'jita', oreForm: 'compressed' },
    uids: [`char:${m.id}`],
    lines,
    listed: amount,
    mail: { sent: 0, manualSent: 0, remindersStopped: false },
    names: {
      corporationName: CORP_NAME,
      minerName: m.name,
      refineryNames: Object.fromEntries(REFINERIES.map((r) => [String(r.id), r.name])),
    },
  };
  put(sub('lateNotices').doc(noticeId), notice);
  const verifyToken = randomBytes(32).toString('base64url');
  if (m.id === MEMBER) token = verifyToken;
  put(sub('lateNoticeLinks').doc(noticeId), { token: verifyToken });
  put(db.collection('corpTaxBookTokens').doc(verifyToken), {
    corporationId: CORP,
    [NOTICE_ID_FIELD]: noticeId,
    minerId,
    remindersStopped: false,
    createdAt: NOW - 6 * DAY,
  });
  noticeOf.set(m.id, { noticeId, minerId, amount, code: minerPaymentCode(minerId) });
}

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
const payments = [];
let ref = 900_000;
for (const m of MINERS) {
  const st = noticeOf.get(m.id);
  if (!st) continue;
  const pinned = (amt, back) =>
    donation((ref += 1), m.id, amt, back, { reason: st.code, minerId: st.minerId });
  if (m.pays === 'third') payments.push(pinned(Math.round(st.amount / 3), 4));
  if (m.pays === 'full') payments.push(pinned(st.amount, 5));
  if (m.pays === 'partial') payments.push(pinned(Math.round(st.amount * 0.6), 4));
  if (m.pays === 'over') payments.push(pinned(Math.round(st.amount * 1.2), 3));
}
payments.push(donation((ref += 1), GUEST ?? OFFICER, 2_500_000, 3, { reason: 'moon tax' }));
if (EXTRA_MINERS > 1)
  payments.push(donation((ref += 1), 90_001_001, 1_750_000, 2, { reason: 'ty o7' }));
if (EXTRA_MINERS > 7) payments.push(donation((ref += 1), 90_001_007, 3_100_000, 1));
payments.push(
  donation((ref += 1), MEMBER, 40_000_000, 5, {
    notTaxAmount: 40_000_000,
    notTaxReason: 'Contract payment, not moon tax',
    notTaxBy: OFFICER,
    notTaxAt: iso(NOW - 4 * DAY),
  })
);
for (const p of payments) put(sub('payments').doc(p.id), p);
const memberNotice = noticeOf.get(MEMBER);
put(sub('payments').doc('manual-dev-1'), {
  id: 'manual-dev-1',
  source: 'manual',
  minerId: memberNotice.minerId,
  characterId: MEMBER,
  uid: `char:${MEMBER}`,
  amount: 500_000,
  at: iso(NOW - 2 * DAY),
  note: 'Paid in person',
  recordedBy: OFFICER,
});

const memberOpenRow = MINERS[0].rows.find((r) => r.date === day(3));
put(sub('dismissals').doc('d-dev-1'), {
  id: 'd-dev-1',
  scope: 'record',
  targetId: `${MEMBER}:${memberOpenRow.structureId}:${day(3)}`,
  by: OFFICER,
  at: iso(NOW - 2 * DAY),
  reason: 'Corp fleet op: tax waived',
  uids: [`char:${MEMBER}`],
  amountIsk: 1_000_000,
});
put(sub('declarations').doc('x-dev-1'), {
  id: 'x-dev-1',
  [NOTICE_ID_FIELD]: memberNotice.noticeId,
  kind: 'contract',
  at: iso(NOW - 1 * DAY),
  recordedBy: OFFICER,
  note: 'Says it was paid by contract',
});

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
REFINERIES.forEach((s, i) => {
  extraction(s, 400, -300, -250);
  const live = i % 4;
  if (live === 0) extraction(s, 24, 72 + i * 10, 120 + i * 10);
  if (live === 1) extraction(s, 120, -2, 46);
  if (live === 2) extraction(s, 200, -80, -30, 30);
  if (live === 3) extraction(s, 60, 8, 56);
});

const SRP_HULLS = [587, 24698, 638, 16240, 22544, 17476, 28606];
put(book.collection('srp').doc('settings'), {
  corporationId: CORP,
  enabled: true,
  killmailPct: 60,
  appraisalPct: null,
  hullRules: [
    { scope: 'hull', id: 587, kind: 'pay-fixed', iskAmount: 4_000_000 },
    { scope: 'hull', id: 24698, kind: 'pay-percent' },
    { scope: 'hull', id: 28606, kind: 'officer-decides' },
    { scope: 'hull', id: 16240, kind: 'not-covered' },
  ],
  windowDays: 30,
  requireFleetOrFc: false,
  createdBy: OFFICER,
  createdAt: NOW - 30 * DAY,
  ownerCharacterId: OFFICER,
  updatedAt: NOW - 3 * DAY,
  updatedBy: OFFICER,
  schemaVersion: 1,
});
put(book.collection('srpOfficers').doc(`char:${OFFICER}`), {
  canEdit: true,
  canManage: true,
  isCeo: true,
  isDirector: true,
  characterId: OFFICER,
  characterName: args['officer-name'],
  ownerHash: args['owner-hash'],
  corporationId: CORP,
  roles: ['Director'],
  checkedAt: NOW,
  expiresAt: NOW + 24 * HOUR,
});
const SRP_STATES = ['pending', 'pending', 'approved', 'paid', 'paid', 'rejected', 'pending'];
for (let i = 0; i < 14; i++) {
  const miner = MINERS[i % MINERS.length];
  const state = SRP_STATES[i % SRP_STATES.length];
  const needsAmount = state === 'pending' && i % 2 === 0;
  const hullTypeId = needsAmount ? 28606 : SRP_HULLS[i % SRP_HULLS.length];
  const killmailId = 130_000_001 + i;
  const filedAt = NOW - (i * 11 + 4) * HOUR;
  const amount = needsAmount ? null : 3_000_000 + ((i * 7) % 9) * 2_500_000;
  const decided = state === 'approved' || state === 'paid' || state === 'rejected';
  const claim = {
    killmailId,
    killmailHash: `dev${String(killmailId).padStart(37, '0')}`,
    corporationId: CORP,
    characterId: miner.id,
    characterName: miner.name,
    uid: `char:${miner.id}`,
    ownerHash: args['owner-hash'],
    hullTypeId,
    solarSystemId: SYSTEMS[i % SYSTEMS.length],
    killedAt: filedAt - 2 * HOUR,
    filedAt,
    state,
    amount,
    basis: amount === null ? null : { step: 'killmail-percent', percent: 60 },
    suggested:
      amount === null ? { isk: 6_500_000, basis: { step: 'killmail-percent', percent: 60 } } : null,
    fleetOrFc: i % 3 === 0 ? 'Dev FC' : null,
    note: i % 4 === 0 ? 'Lost to a gate camp, solo' : null,
    refileCount: 0,
  };
  if (decided) {
    claim.decidedAt = filedAt + 2 * HOUR;
    claim.decidedBy = OFFICER;
    claim.decidedByName = args['officer-name'];
  }
  if (state === 'rejected') {
    claim.rejectionReason = 'Not a doctrine fit';
    claim.closedAt = filedAt + 2 * HOUR;
  }
  if (state === 'paid') {
    claim.paidAt = filedAt + 6 * HOUR;
    claim.paidBy = OFFICER;
    claim.paidByName = args['officer-name'];
    claim.closedAt = filedAt + 6 * HOUR;
  }
  put(book.collection('srpClaims').doc(String(killmailId)), claim);
  const entry = (at, action) =>
    put(
      book
        .collection('srpAudit')
        .doc(`${String(at).padStart(15, '0')}~${randomBytes(6).toString('base64url')}`),
      {
        at,
        by: action === 'fileClaim' ? miner.id : OFFICER,
        byName: action === 'fileClaim' ? miner.name : args['officer-name'],
        action,
        detail: { killmailId, hullTypeId },
      }
    );
  entry(filedAt, 'fileClaim');
  if (decided) entry(filedAt + 2 * HOUR, state === 'rejected' ? 'rejectClaim' : 'approveClaim');
  if (state === 'paid') entry(filedAt + 6 * HOUR, 'markClaimPaid');
}

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
for (const [, st] of noticeOf)
  audit(NOW - 6 * DAY, 'issueLateNotice', {
    noticeId: st.noticeId,
    minerId: st.minerId,
    listed: st.amount,
  });

if (args.players) {
  const fixture = JSON.parse(
    readFileSync(new URL('./sandbox/playerGroups.json', import.meta.url), 'utf8')
  );
  const byName = new Map([...fixture.corp, ...fixture.outside].map((f) => [f.name, f.id]));
  const idOf = (name) => {
    const id = byName.get(name);
    if (id === undefined) throw new Error(`playerGroups.json has no character "${name}"`);
    return id;
  };
  const hash = args['owner-hash'];
  const MINED = [
    ['Vane Hauler', [9, 8, 6, 5, 3, 2]],
    ['Vane Miner Two', [7, 5, 4, 2, 1]],
    ['Sora Tenn', [...NOTICE_DAYS, 4, 3, 1]],
    ['Tenn Industrial', [10, 9, 6, 2]],
    ['Dax Orlov', [11, 9, 7, 5, 2, 1]],
    ['Orlov Scout', [12, 8]],
    ['Mira Quill', [10, 7, 5, 3]],
    ['Quill Alt', [6, 4, 2]],
  ];
  for (const [name, days] of MINED) {
    for (const r of observedRows(idOf(name), CORP, days)) {
      put(sub('observed').doc(`${r.characterId}_${r.typeId}_${r.date}_${r.structureId}`), {
        ...r,
        uid: `char:${r.characterId}`,
      });
    }
  }
  const GROUPS = [
    [
      'kestrel',
      'Kestrel Vane',
      ['Kestrel Vane', 'Vane Hauler', 'Vane Miner Two', 'Outer Rim Vane'],
      ['Outer Rim Vane'],
      [],
      [],
      40,
    ],
    [
      'sora',
      'Sora Tenn',
      ['Sora Tenn', 'Tenn Industrial', 'Sora Of Elsewhere'],
      [],
      ['Sora Of Elsewhere'],
      [],
      35,
    ],
    ['dax', 'Dax Orlov', ['Dax Orlov', 'Orlov Scout'], [], [], [], 30],
    ['mira', 'Mira Quill', ['Mira Quill', 'Quill Alt'], [], [], ['Quill Alt'], 25],
    ['bram-a', 'Tomas Reed', ['Tomas Reed', 'Bram Holt'], [], [], [], 20],
    ['bram-b', 'Hana Bright', ['Hana Bright', 'Bram Holt'], [], [], [], 10],
  ];
  const stored = [];
  for (const [key, main, names, claimed, proven, pending, ago] of GROUPS) {
    const characterIds = names.map(idOf);
    const held = new Set([...claimed, ...pending].map(idOf));
    const doc = {
      id: `m-${key}`,
      characterIds,
      mainCharacterId: idOf(main),
      pendingConfirmation: pending.map(idOf),
      officerClaimed: claimed.map(idOf),
      provenCharacterIds: proven.map(idOf),
      confirmedCharacterIds: [],
      createdAt: iso(NOW - ago * DAY),
      uids: characterIds.filter((x) => !held.has(x)).map((x) => `char:${x}`),
    };
    put(sub('miners').doc(doc.id), doc);
    stored.push(doc);
  }
  const bram = idOf('Bram Holt');
  put(sub('meta').doc('groupConflicts'), {
    items: [
      {
        characterId: bram,
        minerIds: stored.filter((m) => m.characterIds.includes(bram)).map((m) => m.id),
        at: iso(NOW - 2 * DAY),
      },
    ],
  });
  const provenIds = [idOf('Sora Of Elsewhere'), idOf('Sora Tenn')].sort((a, b) => a - b);
  const playerId = String(provenIds[0]);
  put(db.collection('players').doc(playerId), {
    id: playerId,
    characterIds: provenIds,
    uids: provenIds.map((x) => `char:${x}`),
    updatedAt: iso(NOW - 3 * DAY),
  });
  for (const characterId of provenIds) {
    put(db.collection('playerCharacters').doc(String(characterId)), {
      characterId,
      playerId,
      ownerHash: hash,
      provenAt: iso(NOW - 3 * DAY),
    });
  }
  const nyx = idOf('Nyx Arden');
  put(sub('meta').doc('declinedAutoGroup'), { ids: [nyx] });
  put(sub('meta').doc('groupingAnswers'), {
    answers: {
      [String(nyx)]: { minerId: 'm-dax', answer: 'declined', via: 'character', at: iso(NOW - DAY) },
    },
  });
}

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
if (args.players)
  console.log(
    'Seeded Player groups (--players): 6 Miner groups, 1 Player, 1 conflict, 1 declined.'
  );
console.log(`Verify URL: http://localhost:${args.port}/corp-tax-book/verify/${token}`);

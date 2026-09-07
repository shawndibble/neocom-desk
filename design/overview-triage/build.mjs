/**
 * Emits the `.dc.html` artboards for the reworked Overview board.
 *
 * Round 2. The first pass offered three organising principles; the feedback
 * settled the shape (domain cards) and rejected all three as drawn, for one
 * reason that runs through every note:
 *
 *   **Volume.** 21 orders undercut at once. Every colony on the same timer,
 *   because you reset them all in one sitting. Dozens of alerts. A board that
 *   prints a row per item is a board that is unusable on exactly the days it
 *   matters.
 *
 * So the rule here is: a card shows *numbers* where the items are
 * interchangeable, and *rows* only where each item is genuinely its own thing.
 * That is why the cards are deliberately not uniform:
 *
 *   Training     one line — there is only ever one thing training
 *   Open orders  three counts (undercut / outbid / relist), no rows
 *   Mining tax   two counts (unpaid ISK, unassigned entries)
 *   Planetary    rows, but one row per *batch* of colonies sharing a timer
 *   Industry     rows — jobs really are individual, and the timings differ
 *   Alerts       rows grouped by notification type, with a count each
 *
 * `HeavyDay` is the proof: identical layout, identical heights, numbers an
 * order of magnitude larger.
 *
 *   node design/overview-triage/build.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  C,
  S,
  SEV,
  ageBadge,
  artboard,
  bottomBar,
  card,
  characterHeader,
  icon,
  numberTile,
  panelHeader,
  rail,
  refreshButton,
  stripCell,
  subNav,
  tileRow,
  triageRow,
} from './parts.mjs';

const OUT = dirname(fileURLToPath(import.meta.url));

// --- Shells ----------------------------------------------------------------

function desktop(body, height = 900) {
  return artboard({
    width: 1440,
    height,
    body: `${rail(height)}
<main style="display: flex; min-width: 0; flex: 1; padding: 16px;">
  <div style="display: flex; width: 100%; max-width: 1152px; margin: 0 auto; flex-direction: column; gap: 16px;">
    ${characterHeader()}
    ${subNav(false)}
    ${body}
  </div>
</main>`,
  });
}

function phone(body) {
  return artboard({
    width: 390,
    height: 844,
    body: `<div style="display: flex; width: 100%; flex-direction: column; gap: 6px; padding: 16px 16px 61px;">
  ${characterHeader()}
  ${subNav(true)}
  ${body}
</div>
${bottomBar()}`,
  });
}

/**
 * The summary strip. `Next deadline` leads at the 30px hero tier — it is the
 * one question the page is asked every time it opens, and the feedback singled
 * it out as the useful part of the first round.
 *
 * `You owe`, not "owed to you": the Moon Mining Tax ledger records what this
 * Character owes its Payees. There is no other direction, and the first draft
 * had it backwards.
 */
function summaryStrip({
  deadline,
  deadlineNote,
  deadlineTone,
  training,
  trainingNote,
  wallet,
  owe,
  oweNote,
  age = '4m',
  // `DataAgeBadge` tones itself by staleness: dim under an hour, warning under
  // a day, danger past that. A board full of countdowns computed off a two-day
  // fetch has to say so.
  ageTone = C.dim,
}) {
  return `<section style="${S.panel}">
  <div style="display: flex; align-items: center; gap: 28px; padding: 12px 16px;">
    ${stripCell({ label: 'Next deadline', value: deadline, tone: deadlineTone, note: deadlineNote, hero: true, grow: 1.4 })}
    ${stripCell({ label: 'Training now', value: training, note: trainingNote, grow: 1.6 })}
    ${stripCell({ label: 'Wallet', value: wallet, tone: C.iskPos })}
    ${stripCell({ label: 'You owe', value: owe, tone: C.text, note: oweNote })}
    <span style="display: flex; flex-shrink: 0; align-items: center; gap: 8px;">${ageBadge(age, ageTone)}${refreshButton()}</span>
  </div>
</section>`;
}

// --- The board -------------------------------------------------------------

/**
 * Open orders as three counts. Below-floor keeps its own line in the footer
 * rather than a fourth tile: it is the one order problem that is losing money
 * right now rather than merely losing the sale, and folding it into "undercut"
 * would hide it.
 */
function ordersCard({ undercut, outbid, relist, floor, slots, touch = false }) {
  return card({
    title: 'Open orders',
    // On a phone the footer is the difference between fitting and not, so the
    // one signal it carries moves up into the header rather than being lost.
    meta:
      touch && floor > 0
        ? `<span style="${S.micro} color: ${C.danger};">${floor} below floor</span>`
        : `<span style="${S.micro} color: ${C.dim};">${undercut + outbid + relist} need work</span>`,
    open: 'Orders',
    touch,
    body: tileRow([
      numberTile({ label: 'Undercut', value: undercut, sev: 'warning' }),
      numberTile({ label: 'Outbid', value: outbid, sev: 'warning' }),
      numberTile({ label: 'Relist', value: relist, sev: 'watch' }),
    ]),
    footer: touch
      ? ''
      : floor > 0
        ? `<span style="color: ${C.danger};">${floor} below your cost floor</span> · ${slots}`
        : `Nothing below your cost floor · ${slots}`,
  });
}

function miningCard({ unpaid, payees, unassigned, note }) {
  return card({
    title: 'Mining tax',
    open: 'Mining Tax',
    body: tileRow([
      numberTile({ label: 'ISK unpaid', value: unpaid, sev: 'warning' }),
      numberTile({ label: 'Unassigned', value: unassigned, sev: 'watch' }),
    ]),
    footer: `${payees} payees · ${note}`,
  });
}

function trainingCard({ skill, left, queue }) {
  return card({
    title: 'Training',
    open: 'Skills',
    body: `<ul>${triageRow({
      sev: 'watch',
      when: left,
      subject: skill,
      detail: 'Finishes 24 Sep 18:40',
      noDest: true,
      last: true,
    })}</ul>`,
    footer: queue,
  });
}

/** Rows are batches, not colonies: you reset every planet in one sitting, so they share a timer. */
function planetaryCard({ rows, footer, touch = false }) {
  return card({
    title: 'Planetary industry',
    meta: `<span style="${S.micro} color: ${SEV[rows[0].sev].color};">${SEV[rows[0].sev].word}</span>`,
    open: 'Planetary',
    touch,
    body: `<ul>${rows.map((r, i) => triageRow({ ...r, compact: !touch, touch, noDest: true, last: i === rows.length - 1 })).join('\n')}</ul>`,
    footer: touch ? '' : footer,
  });
}

function industryCard({ rows, footer }) {
  return card({
    title: 'Industry jobs',
    meta: `<span style="${S.micro} color: ${C.warning};">Warning</span>`,
    open: 'Industry',
    body: `<ul>${rows.map((r, i) => triageRow({ ...r, compact: true, noDest: true, last: i === rows.length - 1 })).join('\n')}</ul>`,
    footer,
  });
}

/**
 * Alerts grouped by notification type, count first. Ninety "market order
 * filled" notifications are one fact, and the feed already carries the
 * `eventId` (and, for EVE-native ones, `eveType`) to group on.
 */
function alertsCard({ rows, footer, touch = false }) {
  return card({
    title: 'Alerts',
    meta: `<span style="${S.micro} color: ${C.dim};">Grouped by type</span>`,
    open: 'Feed',
    touch,
    body: `<ul>${rows.map((r, i) => triageRow({ ...r, compact: !touch, touch, noDest: true, last: i === rows.length - 1 })).join('\n')}</ul>`,
    footer,
  });
}

function scopeNote() {
  return `<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.warning};"></span>
  Contracts has no card — the scope is missing, so nothing about it is known. Sign in again to restore it.
</p>`;
}

/**
 * One line for the pilots this board is not about. Everything above is the
 * active Character; the alert feed is the only device-wide thing on the page.
 * Still an open question (see the canvas notes) — drawn as a line rather than a
 * panel so it costs almost nothing if the answer is "leave it out".
 */
function othersLine(pilots) {
  return `<div style="display: flex; height: 44px; align-items: center; gap: 20px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panelGlass}; padding: 0 12px;">
  <span style="${S.microDim} flex-shrink: 0;">Your other characters</span>
  ${pilots
    .map(
      ([name, sev, detail]) =>
        `<span style="display: inline-flex; min-width: 0; align-items: center; gap: 5px; font-size: 12px; color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 14)}<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}<span style="color: ${C.dim};"> · ${detail}</span></span></span>`
    )
    .join('')}
  <span style="margin-left: auto; flex-shrink: 0; color: ${C.accent};">${icon('caret', 12)}</span>
</div>`;
}

function grid(cards) {
  return `<div style="display: grid; min-width: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; gap: 12px;">
  ${cards.join('\n  ')}
</div>`;
}

// --- Main: an ordinary evening ---------------------------------------------

const main = desktop(`
${summaryStrip({
  deadline: '3h 12m',
  deadlineNote: '4 colonies end together — Gehi IV, V, VI, VIII',
  deadlineTone: C.warning,
  training: 'Caldari Battleship V',
  trainingNote: '1d 4h left · 6 skills queued',
  wallet: '1,284,902,441',
  owe: '412.6M ISK',
  oweNote: 'Moon mining, 4 payees',
})}

${grid([
  trainingCard({
    skill: 'Caldari Battleship V',
    left: '1d 4h',
    queue: '6 skills queued · ends 24 Sep 18:40',
  }),
  ordersCard({
    undercut: 21,
    outbid: 4,
    relist: 2,
    floor: 2,
    slots: '24 of 41 slots used',
  }),
  miningCard({
    unpaid: '412.6M',
    payees: 4,
    unassigned: 12,
    note: 'oldest unpaid 11 days',
  }),
])}

${grid([
  planetaryCard({
    rows: [
      {
        sev: 'critical',
        when: 'Idle 6h',
        subject: '2 colonies expired',
        detail: 'Gehi V — Barren, Gehi VI — Plasma',
        short: { subject: '2 colonies expired', detail: 'Gehi V, Gehi VI' },
      },
      {
        sev: 'warning',
        when: '3h 12m',
        subject: '4 colonies end together',
        detail: 'Gehi IV, V, VI, VIII — one reset run',
        short: { subject: '4 colonies end together', detail: 'One reset run' },
      },
      {
        sev: 'watch',
        when: '2d 6h',
        subject: '2 colonies after that',
        detail: 'Ahbazon III, IV',
        short: { subject: '2 colonies after that', detail: 'Ahbazon III, IV' },
      },
      {
        sev: 'clear',
        when: 'Unbuilt',
        subject: '1 planet with no colony',
        detail: 'Ahbazon VII — a plan is saved for it',
        short: { subject: '1 planet, no colony', detail: 'Ahbazon VII' },
      },
    ],
    footer: '8 colonies · 24 extractor programs',
  }),
  industryCard({
    rows: [
      {
        sev: 'warning',
        when: 'Ready',
        subject: '4 jobs ready to deliver',
        detail: 'Oldest finished 2d 4h ago',
        short: { subject: '4 jobs ready to deliver', detail: 'Oldest 2d 4h ago' },
      },
      {
        sev: 'watch',
        when: '5h 40m',
        subject: 'Fermionic Condensates ×2',
        detail: 'Reaction · Sotiyo, Ahbazon',
        short: { subject: 'Fermionic Condensates ×2', detail: 'Reaction · Sotiyo' },
      },
      {
        sev: 'clear',
        when: '2d 3h',
        subject: 'Ishtar ×1',
        detail: 'Manufacturing · Sotiyo, Ahbazon',
        short: { subject: 'Ishtar ×1', detail: 'Manufacturing · Sotiyo' },
      },
      {
        sev: 'clear',
        when: '3d 1h',
        subject: 'Nitrogen Fuel Block ×2,400',
        detail: 'Manufacturing · Sotiyo, Ahbazon',
        short: { subject: 'Nitrogen Fuel Block ×2,400', detail: 'Sotiyo' },
      },
    ],
    footer: '6 running · +3 more finish this week',
  }),
  alertsCard({
    rows: [
      {
        sev: 'critical',
        when: '3',
        subject: 'Structure under attack',
        detail: 'Newest 40m ago — Athanor, Gehi IV',
        short: { subject: 'Structure under attack', detail: 'Newest 40m ago' },
      },
      {
        sev: 'watch',
        when: '12',
        subject: 'Skill training complete',
        detail: 'Newest 2h ago',
        short: { subject: 'Skill training complete', detail: 'Newest 2h ago' },
      },
      {
        sev: 'clear',
        when: '47',
        subject: 'Market order filled',
        detail: 'Newest 6m ago',
        short: { subject: 'Market order filled', detail: 'Newest 6m ago' },
      },
      {
        sev: 'clear',
        when: '8',
        subject: 'Contract accepted',
        detail: 'Newest 3h ago',
        short: { subject: 'Contract accepted', detail: 'Newest 3h ago' },
      },
    ],
    footer: '70 unread across 9 types · +6 more · Dismiss all',
  }),
])}

${othersLine([
  ['Sera Vantis', 'critical', 'nothing training, 2d'],
  ['Orrin Kade', 'warning', '2 colonies expiring'],
  ['Tal Rhoem', 'clear', 'nothing needs you'],
])}

${scopeNote()}`);

// --- HeavyDay: the same board on a bad night --------------------------------
// Identical structure, identical card heights. Only the numbers move.

const heavyDay = desktop(`
${summaryStrip({
  deadline: '12m',
  deadlineNote: '8 colonies end together — one reset run, now',
  deadlineTone: C.danger,
  training: 'Nothing in training',
  trainingNote: 'Queue empty for 2d 4h',
  wallet: '86,402,118',
  owe: '2.41B ISK',
  oweNote: 'Moon mining, 11 payees',
  age: '2d',
  ageTone: C.danger,
})}

${grid([
  card({
    title: 'Training',
    meta: `<span style="${S.micro} color: ${C.danger};">Critical</span>`,
    open: 'Skills',
    body: `<ul>${triageRow({
      sev: 'critical',
      when: 'Empty',
      subject: 'Nothing in training',
      detail: 'Queue has been empty for 2d 4h',
      noDest: true,
      last: true,
    })}</ul>`,
    footer: 'Nothing queued · 412,000 unallocated SP',
  }),
  ordersCard({
    undercut: 137,
    outbid: 22,
    relist: 9,
    floor: 11,
    slots: '41 of 41 slots used',
  }),
  miningCard({
    unpaid: '2.41B',
    payees: 11,
    unassigned: 340,
    note: 'oldest unpaid 63 days',
  }),
])}

${grid([
  planetaryCard({
    rows: [
      {
        sev: 'critical',
        when: 'Idle 3d',
        subject: '6 colonies expired',
        detail: 'Gehi, Ahbazon, Hykkota — nothing extracting',
        short: { subject: '6 colonies expired', detail: 'Nothing extracting' },
      },
      {
        sev: 'critical',
        when: '12m',
        subject: '8 colonies end together',
        detail: 'One reset run — start now',
        short: { subject: '8 colonies end together', detail: 'One reset run' },
      },
      {
        sev: 'watch',
        when: '5h 02m',
        subject: '4 colonies after that',
        detail: 'Hykkota VII, VIII, IX, X',
        short: { subject: '4 colonies after that', detail: 'Hykkota VII–X' },
      },
      {
        sev: 'clear',
        when: 'Unbuilt',
        subject: '3 planets with no colony',
        detail: 'Plans saved for all three',
        short: { subject: '3 planets, no colony', detail: 'Plans saved' },
      },
    ],
    footer: '18 colonies · 54 extractor programs',
  }),
  industryCard({
    rows: [
      {
        sev: 'warning',
        when: 'Ready',
        subject: '12 jobs ready to deliver',
        detail: 'Oldest finished 9d ago',
        short: { subject: '12 jobs ready to deliver', detail: 'Oldest 9d ago' },
      },
      {
        sev: 'watch',
        when: '41m',
        subject: 'Hyperflurite ×8',
        detail: 'Reaction · Athanor, Gehi IV',
        short: { subject: 'Hyperflurite ×8', detail: 'Reaction · Athanor' },
      },
      {
        sev: 'watch',
        when: '2h 15m',
        subject: 'Nitrogen Fuel Block ×2,400',
        detail: 'Manufacturing · Sotiyo, Ahbazon',
        short: { subject: 'Nitrogen Fuel Block ×2,400', detail: 'Sotiyo' },
      },
      {
        sev: 'clear',
        when: '9h 30m',
        subject: 'Ishtar ×4',
        detail: 'Manufacturing · Sotiyo, Ahbazon',
        short: { subject: 'Ishtar ×4', detail: 'Manufacturing · Sotiyo' },
      },
    ],
    footer: '30 running · +27 more finish this week',
  }),
  alertsCard({
    rows: [
      {
        sev: 'critical',
        when: '19',
        subject: 'Structure under attack',
        detail: 'Newest 4m ago — Athanor, Gehi IV',
        short: { subject: 'Structure under attack', detail: 'Newest 4m ago' },
      },
      {
        sev: 'warning',
        when: '6',
        subject: 'Structure fuel low',
        detail: 'Newest 1h ago',
        short: { subject: 'Structure fuel low', detail: 'Newest 1h ago' },
      },
      {
        sev: 'clear',
        when: '284',
        subject: 'Market order filled',
        detail: 'Newest 1m ago',
        short: { subject: 'Market order filled', detail: 'Newest 1m ago' },
      },
      {
        sev: 'clear',
        when: '31',
        subject: 'Skill training complete',
        detail: 'Newest 9h ago',
        short: { subject: 'Skill training complete', detail: 'Newest 9h ago' },
      },
    ],
    footer: '341 unread across 17 types · +14 more · Dismiss all',
  }),
])}

${othersLine([
  ['Sera Vantis', 'critical', '9 colonies expired'],
  ['Orrin Kade', 'critical', 'nothing training, 14d'],
  ['Tal Rhoem', 'warning', '31 orders undercut'],
])}

<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.danger};"></span>
  Same layout, same card heights, ten times the volume. Nothing scrolled, nothing was hidden that mattered.
</p>`);

// --- QuietNight: what you actually see most evenings ------------------------

const quietNight = desktop(
  `
${summaryStrip({
  deadline: '2d 6h',
  deadlineNote: 'Nothing due before Thursday',
  deadlineTone: C.text,
  training: 'Caldari Battleship V',
  trainingNote: '1d 4h left · 6 skills queued',
  wallet: '1,284,902,441',
  owe: 'Nothing',
  oweNote: 'Every payee settled',
})}

${grid([
  trainingCard({
    skill: 'Caldari Battleship V',
    left: '1d 4h',
    queue: '6 skills queued · ends 24 Sep 18:40',
  }),
  ordersCard({ undercut: 0, outbid: 0, relist: 0, floor: 0, slots: '24 of 41 slots used' }),
  miningCard({ unpaid: '0', payees: 4, unassigned: 0, note: 'last settled 2 days ago' }),
])}

${grid([
  card({
    title: 'Planetary industry',
    meta: `<span style="${S.micro} color: ${C.dim};">Clear</span>`,
    open: 'Planetary',
    body: `<ul>${triageRow({
      sev: 'clear',
      when: '2d 6h',
      subject: '8 colonies extracting',
      detail: 'Next batch ends Thursday — one reset run',
      compact: true,
      noDest: true,
      last: true,
    })}</ul>`,
    footer: '8 colonies · 24 extractor programs',
  }),
  card({
    title: 'Industry jobs',
    meta: `<span style="${S.micro} color: ${C.dim};">Clear</span>`,
    open: 'Industry',
    body: `<ul>${triageRow({
      sev: 'clear',
      when: '5h 40m',
      subject: '6 jobs running',
      detail: 'Next delivery Fermionic Condensates ×2',
      compact: true,
      noDest: true,
      last: true,
    })}</ul>`,
    footer: 'Nothing waiting to be delivered',
  }),
  card({
    title: 'Alerts',
    meta: `<span style="${S.micro} color: ${C.dim};">Clear</span>`,
    open: 'Feed',
    body: `<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 16px; text-align: center;">
  <span style="color: ${C.success};">${icon('clear', 24)}</span>
  <p style="font-size: 13px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.dim};">Nothing new</p>
</div>`,
    footer: 'Last alert 2 days ago',
  }),
])}

<p style="${S.microDim}">The state you are in most evenings. Every card still says what it checked, so a quiet board is never mistaken for a broken one.</p>`,
  680
);

// --- AlertsRail: the one fork worth drawing twice ---------------------------
// Alerts are a different volume class from everything else. Either they take a
// card and roll up (Main), or they get a column of their own.

const alertsRail = desktop(`
${summaryStrip({
  deadline: '3h 12m',
  deadlineNote: '4 colonies end together — Gehi IV, V, VI, VIII',
  deadlineTone: C.warning,
  training: 'Caldari Battleship V',
  trainingNote: '1d 4h left · 6 skills queued',
  wallet: '1,284,902,441',
  owe: '412.6M ISK',
  oweNote: 'Moon mining, 4 payees',
})}

<div style="display: grid; min-width: 0; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; gap: 16px;">
  <div style="display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 12px;">
    ${ordersCard({ undercut: 21, outbid: 4, relist: 2, floor: 2, slots: '24 of 41 slots used' })}
    ${miningCard({ unpaid: '412.6M', payees: 4, unassigned: 12, note: 'oldest unpaid 11 days' })}
    ${planetaryCard({
      rows: [
        {
          sev: 'critical',
          when: 'Idle 6h',
          subject: '2 colonies expired',
          detail: 'Gehi V — Barren, Gehi VI — Plasma',
          short: { subject: '2 colonies expired', detail: 'Gehi V, Gehi VI' },
        },
        {
          sev: 'warning',
          when: '3h 12m',
          subject: '4 colonies end together',
          detail: 'One reset run',
          short: { subject: '4 colonies end together', detail: 'One reset run' },
        },
        {
          sev: 'watch',
          when: '2d 6h',
          subject: '2 colonies after that',
          detail: 'Ahbazon III, IV',
          short: { subject: '2 colonies after that', detail: 'Ahbazon III, IV' },
        },
        {
          sev: 'clear',
          when: 'Unbuilt',
          subject: '1 planet with no colony',
          detail: 'Ahbazon VII',
          short: { subject: '1 planet, no colony', detail: 'Ahbazon VII' },
        },
      ],
      footer: '8 colonies · 24 extractor programs',
    })}
    ${industryCard({
      rows: [
        {
          sev: 'warning',
          when: 'Ready',
          subject: '4 jobs ready to deliver',
          detail: 'Oldest finished 2d 4h ago',
          short: { subject: '4 jobs ready to deliver', detail: 'Oldest 2d 4h ago' },
        },
        {
          sev: 'watch',
          when: '5h 40m',
          subject: 'Fermionic Condensates ×2',
          detail: 'Reaction · Sotiyo',
          short: { subject: 'Fermionic Condensates ×2', detail: 'Reaction · Sotiyo' },
        },
        {
          sev: 'clear',
          when: '2d 3h',
          subject: 'Ishtar ×1',
          detail: 'Manufacturing · Sotiyo',
          short: { subject: 'Ishtar ×1', detail: 'Manufacturing · Sotiyo' },
        },
        {
          sev: 'clear',
          when: '3d 1h',
          subject: 'Nitrogen Fuel Block ×2,400',
          detail: 'Manufacturing · Sotiyo',
          short: { subject: 'Nitrogen Fuel Block ×2,400', detail: 'Sotiyo' },
        },
      ],
      footer: '6 running · +3 more this week',
    })}
  </div>

  <section style="${S.panel}">
    ${panelHeader({
      title: 'Alerts',
      meta: `<span style="${S.micro} color: ${C.dim};">70 unread</span>`,
      actions: `<span style="display: inline-flex; align-items: center; gap: 4px; ${S.micro} color: ${C.accent};">Dismiss all</span>`,
    })}
    <ul>
      ${[
        {
          sev: 'critical',
          when: '3',
          subject: 'Structure under attack',
          detail: 'Newest 40m — Athanor, Gehi IV',
          short: { subject: 'Structure under attack', detail: 'Newest 40m' },
        },
        {
          sev: 'warning',
          when: '2',
          subject: 'Structure fuel low',
          detail: 'Newest 5h — Raitaru, Ahbazon',
          short: { subject: 'Structure fuel low', detail: 'Newest 5h' },
        },
        {
          sev: 'watch',
          when: '12',
          subject: 'Skill training complete',
          detail: 'Newest 2h',
          short: { subject: 'Skill training complete', detail: 'Newest 2h' },
        },
        {
          sev: 'watch',
          when: '4',
          subject: 'Contract accepted',
          detail: 'Newest 3h',
          short: { subject: 'Contract accepted', detail: 'Newest 3h' },
        },
        {
          sev: 'clear',
          when: '47',
          subject: 'Market order filled',
          detail: 'Newest 6m',
          short: { subject: 'Market order filled', detail: 'Newest 6m' },
        },
        {
          sev: 'clear',
          when: '2',
          subject: 'New mail',
          detail: 'Newest 1d',
          short: { subject: 'New mail', detail: 'Newest 1d' },
        },
        {
          sev: 'clear',
          when: '5',
          subject: 'Wallet balance changed',
          detail: 'Newest 20m',
          short: { subject: 'Wallet balance changed', detail: 'Newest 20m' },
        },
      ]
        .map((r, i, all) =>
          triageRow({ ...r, compact: true, noDest: true, last: i === all.length - 1 })
        )
        .join('\n')}
    </ul>
    <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim}">+2 more types · a column, so a loud day never pushes the board around</p>
  </section>
</div>

${othersLine([
  ['Sera Vantis', 'critical', 'nothing training, 2d'],
  ['Orrin Kade', 'warning', '2 colonies expiring'],
  ['Tal Rhoem', 'clear', 'nothing needs you'],
])}

${scopeNote()}`);

// --- Phone -----------------------------------------------------------------
// Cards sort by worst severity, so the thing on fire is above the fold on a
// screen that can only hold three of them.

const boardPhone = phone(`
<section style="${S.panel}">
  <div style="display: flex; align-items: center; gap: 16px; padding: 8px 12px;">
    ${stripCell({ label: 'Next deadline', value: '3h 12m', tone: C.warning, grow: 1 })}
    ${stripCell({ label: 'Training · 1d 4h', value: 'Caldari BS V', grow: 1.2 })}
  </div>
</section>

${planetaryCard({
  touch: true,
  rows: [
    {
      sev: 'critical',
      when: 'Idle 6h',
      subject: '2 colonies expired',
      detail: 'Gehi V, Gehi VI',
    },
    {
      sev: 'warning',
      when: '3h 12m',
      subject: '4 colonies end together',
      detail: 'One reset run',
    },
  ],
})}

${ordersCard({
  undercut: 21,
  outbid: 4,
  relist: 2,
  floor: 2,
  slots: '24 of 41 slots',
  touch: true,
})}

<section style="${S.panel}">
  ${panelHeader({ title: 'Everything else', touch: true })}
  ${[
    ['Alerts', 'critical', '70 unread · 9 types'],
    ['Industry jobs', 'warning', '4 ready to deliver'],
    ['Mining tax', 'warning', '412.6M unpaid'],
  ]
    .map(
      ([label, sev, detail], i, all) =>
        `<div style="display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 8px 12px;${i === all.length - 1 ? '' : ` border-bottom: 1px solid ${C.line};`}">
  <span style="color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 16)}</span>
  <span style="min-width: 0; flex: 1; font-size: 13px;">${label}</span>
  <span style="font-size: 12px; color: ${C.dim}; white-space: nowrap;">${detail}</span>
  <span style="color: ${C.accent};">${icon('caret', 12)}</span>
</div>`
    )
    .join('\n')}
</section>`);

// --- Anatomy ---------------------------------------------------------------

function rulePanel(title, body, note) {
  return `<section style="${S.panel} display: flex; min-width: 0; flex: 1; flex-direction: column;">
  ${panelHeader({ title })}
  <div style="flex: 1;">${body}</div>
  <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; font-size: 11px; line-height: 15px; color: ${C.dim};">${note}</p>
</section>`;
}

const anatomy = artboard({
  width: 1440,
  height: 420,
  body: `<div style="display: flex; width: 100%; flex-direction: column; gap: 16px; padding: 24px;">
  <div>
    <h1 style="font-size: 20px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">Why the cards are not the same shape</h1>
    <p style="margin-top: 4px; font-size: 12px; color: ${C.dim};">A uniform grid was the first round’s mistake. Numbers where the items are interchangeable, rows only where each item is its own thing.</p>
  </div>

  <div style="display: flex; align-items: stretch; gap: 16px;">
    ${rulePanel(
      'Counts, not rows',
      `<div style="padding: 12px;">
  <div style="display: flex; gap: 8px;">
    ${numberTile({ label: 'Undercut', value: 21, sev: 'warning' })}
    ${numberTile({ label: 'Outbid', value: 4, sev: 'warning' })}
    ${numberTile({ label: 'Relist', value: 2, sev: 'watch' })}
  </div>
</div>`,
      'Twenty-one undercut orders is one fact, not twenty-one. Each tile opens Orders already filtered. Below-floor stays on its own footer line — it loses money now, not just the sale.'
    )}
    ${rulePanel(
      'One row per batch',
      `<ul>
  ${triageRow({
    sev: 'warning',
    when: '3h 12m',
    subject: '4 colonies end together',
    detail: 'Gehi IV, V, VI, VIII — one reset run',
    compact: true,
    noDest: true,
  })}
  ${triageRow({
    sev: 'watch',
    when: '2d 6h',
    subject: '2 colonies after that',
    detail: 'Ahbazon III, IV',
    compact: true,
    noDest: true,
    last: true,
  })}
</ul>`,
      'Colonies get reset in one sitting, so they share an expiry. The row is the reset run you will actually do, not the planet.'
    )}
    ${rulePanel(
      'Grouped by type',
      `<ul>
  ${triageRow({
    sev: 'critical',
    when: '3',
    subject: 'Structure under attack',
    detail: 'Newest 40m ago',
    compact: true,
    noDest: true,
  })}
  ${triageRow({
    sev: 'clear',
    when: '47',
    subject: 'Market order filled',
    detail: 'Newest 6m ago',
    compact: true,
    noDest: true,
    last: true,
  })}
</ul>`,
      'The feed already carries eventId (and eveType for EVE-native ones). Grouping on it turns 341 alerts into a dozen rows, worst type first.'
    )}
    ${rulePanel(
      'When it can’t be read',
      `<div style="padding: 12px;">
  <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.warning};">Contracts can’t be checked</p>
  <p style="margin-top: 6px; font-size: 12px; line-height: 16px; color: ${C.dim};">Scope not granted. No card, and a line saying so.</p>
  <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
    ${ageBadge('2d', C.danger)}
    <span style="${S.micro} color: ${C.warning};">Offline — last fetch</span>
  </div>
</div>`,
      'Silence is the failure mode the current Overview has. A domain that could not be read says so; a stale one wears its age beside every countdown it prints.'
    )}
  </div>

  <div style="display: flex; align-items: center; gap: 24px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panelGlass}; padding: 12px 16px;">
    <span style="${S.microDim}">Severity ladder</span>
    ${['critical', 'warning', 'watch', 'clear']
      .map(
        (sev) =>
          `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 16)}${SEV[sev].word}</span>`
      )
      .join('')}
    <span style="font-size: 11px; color: ${C.dim};">Four tones, four outlines — the ladder <span style="color: ${C.text};">CorpBoardRow</span> already uses, so colour is never the only signal.</span>
  </div>
</div>`,
});

// --- canvas.json -----------------------------------------------------------

const canvas = {
  artboards: [
    { file: 'Main.dc.html', title: 'Reworked board — Desktop', x: 0, y: 0, w: 1440, h: 900 },
    { file: 'HeavyDay.dc.html', title: 'Heavy day — same layout', x: 1560, y: 0, w: 1440, h: 900 },
    {
      file: 'AlertsRail.dc.html',
      title: 'Alternate — alerts as a column',
      x: 3120,
      y: 0,
      w: 1440,
      h: 900,
    },
    { file: 'BoardPhone.dc.html', title: 'Reworked board — Phone', x: 0, y: 1060, w: 390, h: 844 },
    { file: 'QuietNight.dc.html', title: 'Quiet night', x: 520, y: 1060, w: 1440, h: 680 },
    { file: 'Anatomy.dc.html', title: 'Card anatomy & rules', x: 2100, y: 1060, w: 1440, h: 420 },
  ],
  annotations: [
    {
      id: 'rework',
      x: 0,
      y: -340,
      w: 520,
      text: 'ROUND 2 — what changed\n\nThe shape is settled (domain cards). The rule is new: NUMBERS where items are interchangeable, ROWS only where each item is its own thing. So the cards are deliberately different shapes.\n\n· Training — one line, in the strip and in its card\n· Open orders — three counts (undercut / outbid / relist), no rows. Below-floor keeps a footer line of its own\n· Mining tax — two counts: ISK unpaid, entries unassigned\n· Planetary — one row per BATCH sharing a timer, not per colony\n· Industry — real rows, kept as you liked it\n· Alerts — grouped by notification type, count first\n\nFixed: "Owed to you" was backwards — the ledger records what you owe your payees. It now reads "You owe".\n\nDropped: the 48-hour bar chart, the merged action queue, the decayed-colony row.',
    },
    {
      id: 'heavy',
      x: 1560,
      y: -340,
      w: 380,
      text: 'THE PROOF\n\nSame board, bad night: 137 undercut, 18 colonies with 6 expired, 341 alerts across 17 types, empty skill queue, two-day-old data.\n\nIdentical layout. Identical card heights. Nothing scrolled and nothing that mattered got pushed off — which is the thing the first round could not do.',
    },
    {
      id: 'fork',
      x: 3120,
      y: -340,
      w: 380,
      text: 'THE ONE OPEN FORK\n\nAlerts are a different volume class from everything else. Two answers:\n\nMAIN — alerts take an ordinary card, show the worst three types, roll the rest into the footer. The board stays a board.\n\nTHIS — alerts get a column of their own, so a loud day never pushes the other cards around and you can dismiss in place.\n\nCosts a third of the width every day to solve a problem you have some days.',
    },
    {
      id: 'open-q',
      x: 520,
      y: 1740,
      w: 520,
      text: 'STILL OPEN\n\n1. Multi-character. All of this is the active character. The alert feed is device-wide. Should the board span every pilot, or stay one at a time?\n\n2. Deep links. "Undercut 21" would open /market?section=orders — there is no route today that opens it pre-filtered to undercut, or that jumps to one colony. Worth adding?\n\n3. Does this replace Overview, or sit above it? The wallet panel, skill-queue panel and three count tiles are all gone.\n\n4. Is below-floor really a footer line, or does it deserve to be the fourth number?',
    },
  ],
  launch: { view: 'canvas' },
};

// --- Write -----------------------------------------------------------------

const files = {
  'Main.dc.html': main,
  'HeavyDay.dc.html': heavyDay,
  'AlertsRail.dc.html': alertsRail,
  'BoardPhone.dc.html': boardPhone,
  'QuietNight.dc.html': quietNight,
  'Anatomy.dc.html': anatomy,
  'canvas.json': `${JSON.stringify(canvas, null, 2)}\n`,
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content, 'utf8');
}
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);

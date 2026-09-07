/**
 * Emits the `.dc.html` artboards for the reworked Overview board.
 *
 * Round 3. The organising rule is settled and the alerts fork is decided:
 *
 *   **Volume.** 21 orders undercut at once. Every colony on the same timer,
 *   because you reset them all in one sitting. Dozens of alerts. A board that
 *   prints a row per item is unusable on exactly the days it matters. So a card
 *   shows *numbers* where the items are interchangeable, and *rows* only where
 *   each item is genuinely its own thing.
 *
 *   **Alerts get a column,** not a card — chosen over the card variant, which
 *   is gone (it is still in git history). They are a different volume class
 *   from everything else, and a column means a loud day never pushes the rest
 *   of the board around.
 *
 * Which raises the question this round exists to answer: the Notification Feed
 * renders *only* inside `routes/Overview.tsx` today. It has no page, no nav
 * entry, and `NOTIFICATION_FALLBACK_ROUTE` is `/overview`, so a tapped push
 * with no route of its own lands on the dashboard. Summarising it into a
 * column would strand every alert the column does not list. `AlertsPage` is
 * the destination that fixes that, and the rail gains the entry to reach it.
 *
 * Board shapes, per domain:
 *
 *   Training     one line — there is only ever one thing training
 *   Open orders  three counts (undercut / outbid / relist), no rows
 *   Mining tax   two counts (unpaid ISK, unassigned entries)
 *   Planetary    rows, but one row per *batch* of colonies sharing a timer
 *   Industry     rows — jobs really are individual, and the timings differ
 *   Alerts       the column: rows grouped by notification type, count first
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
  avatar,
  bottomBar,
  card,
  characterHeader,
  filterChip,
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

function desktop(body, { height = 900, alerts = null, alertsTone = C.dim, active } = {}) {
  return artboard({
    width: 1440,
    height,
    body: `${rail(height, { alerts, alertsTone, active })}
<main style="display: flex; min-width: 0; flex: 1; padding: 16px;">
  <div style="display: flex; width: 100%; max-width: 1152px; margin: 0 auto; flex-direction: column; gap: 16px;">
    ${body}
  </div>
</main>`,
  });
}

/** The Overview shell: character header and sub-nav above whatever the board is. */
function overview(body, opts = {}) {
  return desktop(`${characterHeader()}\n${subNav(false)}\n${body}`, opts);
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
 * one question the page is asked every time it opens.
 *
 * No "you owe" cell: it printed the same ISK figure as the Mining tax card's
 * own `ISK unpaid` tile, two panels apart, and one number in two places is a
 * number you have to check against itself. The card keeps it.
 */
function summaryStrip({
  deadline,
  deadlineNote,
  deadlineTone,
  training,
  trainingNote,
  wallet,
  age = '4m',
  // `DataAgeBadge` tones itself by staleness: dim under an hour, warning under
  // a day, danger past that. A board of countdowns computed off a two-day fetch
  // has to say so.
  ageTone = C.dim,
}) {
  return `<section style="${S.panel}">
  <div style="display: flex; align-items: center; gap: 32px; padding: 12px 16px;">
    ${stripCell({ label: 'Next deadline', value: deadline, tone: deadlineTone, note: deadlineNote, hero: true, grow: 1.3 })}
    ${stripCell({ label: 'Training now', value: training, note: trainingNote, grow: 1.4 })}
    ${stripCell({ label: 'Wallet', value: wallet, tone: C.iskPos, grow: 1 })}
    <span style="display: flex; flex-shrink: 0; align-items: center; gap: 8px;">${ageBadge(age, ageTone)}${refreshButton()}</span>
  </div>
</section>`;
}

// --- Cards -----------------------------------------------------------------

/**
 * Open orders as three counts. Below-floor keeps its own footer line rather
 * than a fourth tile: it is the one order problem that is losing money right
 * now rather than merely losing the sale, and folding it into "undercut" would
 * hide it.
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

function industryCard({ rows, footer, worst = 'warning' }) {
  return card({
    title: 'Industry jobs',
    meta: `<span style="${S.micro} color: ${SEV[worst].color};">${SEV[worst].word}</span>`,
    open: 'Industry',
    body: `<ul>${rows.map((r, i) => triageRow({ ...r, compact: true, noDest: true, last: i === rows.length - 1 })).join('\n')}</ul>`,
    footer,
  });
}

/**
 * The alerts column. Rows are notification *types*, count first — the feed
 * already carries `eventId` (and `eveType` for EVE-native ones) to group on, so
 * 341 alerts across 17 types is a dozen rows rather than 341.
 */
function alertsColumn({ unread, rows, footer }) {
  return `<section style="${S.panel}">
  ${panelHeader({
    title: 'Alerts',
    meta: `<span style="${S.micro} color: ${C.dim};">${unread} unread</span>`,
    actions: `<span style="display: inline-flex; align-items: center; gap: 4px; ${S.micro} color: ${C.accent};">Dismiss all</span>`,
  })}
  <ul>
    ${rows.map((r, i) => triageRow({ ...r, compact: true, noDest: true, last: i === rows.length - 1 })).join('\n')}
  </ul>
  <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim}">${footer}</p>
</section>`;
}

function scopeNote() {
  return `<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.warning};"></span>
  Contracts has no card — the scope is missing, so nothing about it is known. Sign in again to restore it.
</p>`;
}

/**
 * One line for the pilots this board is not about. Everything above it is the
 * active Character; the alert feed is the only device-wide thing on the page.
 * Still an open question — drawn as a line rather than a panel so it costs
 * almost nothing if the answer turns out to be "leave it out".
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

/**
 * The board: four domain cards in a 2fr column, alerts in a 1fr column beside
 * them. One layout, three days' worth of data poured through it.
 */
function board({ strip, cards, alerts, others, note }) {
  return `${summaryStrip(strip)}

<div style="display: grid; min-width: 0; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; gap: 16px;">
  <div style="display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 12px;">
    ${cards.join('\n    ')}
  </div>
  ${alertsColumn(alerts)}
</div>

${othersLine(others)}

${note}`;
}

// --- Main: an ordinary evening ---------------------------------------------

const main = overview(
  board({
    strip: {
      deadline: '3h 12m',
      deadlineNote: '4 colonies end together — Gehi IV, V, VI, VIII',
      deadlineTone: C.warning,
      training: 'Caldari Battleship V',
      trainingNote: '1d 4h left · 6 skills queued',
      wallet: '1,284,902,441 ISK',
    },
    cards: [
      ordersCard({ undercut: 21, outbid: 4, relist: 2, floor: 2, slots: '24 of 41 slots used' }),
      miningCard({ unpaid: '412.6M', payees: 4, unassigned: 12, note: 'oldest unpaid 11 days' }),
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
      }),
    ],
    alerts: {
      unread: 70,
      rows: [
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
      ],
      footer: '+2 more types · open the feed for all of them',
    },
    others: [
      ['Sera Vantis', 'critical', 'nothing training, 2d'],
      ['Orrin Kade', 'warning', '2 colonies expiring'],
      ['Tal Rhoem', 'clear', 'nothing needs you'],
    ],
    note: scopeNote(),
  }),
  { alerts: 70, alertsTone: C.danger }
);

// --- HeavyDay: the same board on a bad night --------------------------------

const heavyDay = overview(
  board({
    strip: {
      deadline: '12m',
      deadlineNote: '8 colonies end together — one reset run, now',
      deadlineTone: C.danger,
      training: 'Nothing in training',
      trainingNote: 'Queue empty for 2d 4h',
      wallet: '86,402,118 ISK',
      age: '2d',
      ageTone: C.danger,
    },
    cards: [
      ordersCard({ undercut: 137, outbid: 22, relist: 9, floor: 11, slots: '41 of 41 slots used' }),
      miningCard({ unpaid: '2.41B', payees: 11, unassigned: 340, note: 'oldest unpaid 63 days' }),
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
            detail: 'Reaction · Athanor',
            short: { subject: 'Hyperflurite ×8', detail: 'Reaction · Athanor' },
          },
          {
            sev: 'watch',
            when: '2h 15m',
            subject: 'Nitrogen Fuel Block ×2,400',
            detail: 'Manufacturing · Sotiyo',
            short: { subject: 'Nitrogen Fuel Block ×2,400', detail: 'Sotiyo' },
          },
          {
            sev: 'clear',
            when: '9h 30m',
            subject: 'Ishtar ×4',
            detail: 'Manufacturing · Sotiyo',
            short: { subject: 'Ishtar ×4', detail: 'Manufacturing · Sotiyo' },
          },
        ],
        footer: '30 running · +27 more this week',
      }),
    ],
    alerts: {
      unread: 341,
      rows: [
        {
          sev: 'critical',
          when: '19',
          subject: 'Structure under attack',
          detail: 'Newest 4m — Athanor, Gehi IV',
          short: { subject: 'Structure under attack', detail: 'Newest 4m' },
        },
        {
          sev: 'critical',
          when: '4',
          subject: 'Reinforcement exit',
          detail: 'Newest 22m',
          short: { subject: 'Reinforcement exit', detail: 'Newest 22m' },
        },
        {
          sev: 'warning',
          when: '6',
          subject: 'Structure fuel low',
          detail: 'Newest 1h',
          short: { subject: 'Structure fuel low', detail: 'Newest 1h' },
        },
        {
          sev: 'watch',
          when: '31',
          subject: 'Skill training complete',
          detail: 'Newest 9h',
          short: { subject: 'Skill training complete', detail: 'Newest 9h' },
        },
        {
          sev: 'watch',
          when: '18',
          subject: 'Contract accepted',
          detail: 'Newest 30m',
          short: { subject: 'Contract accepted', detail: 'Newest 30m' },
        },
        {
          sev: 'clear',
          when: '284',
          subject: 'Market order filled',
          detail: 'Newest 1m',
          short: { subject: 'Market order filled', detail: 'Newest 1m' },
        },
        {
          sev: 'clear',
          when: '9',
          subject: 'Wallet balance changed',
          detail: 'Newest 3m',
          short: { subject: 'Wallet balance changed', detail: 'Newest 3m' },
        },
      ],
      footer: '+10 more types · open the feed for all of them',
    },
    others: [
      ['Sera Vantis', 'critical', '9 colonies expired'],
      ['Orrin Kade', 'critical', 'nothing training, 14d'],
      ['Tal Rhoem', 'warning', '31 orders undercut'],
    ],
    note: `<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.danger};"></span>
  Same layout, same card heights, ten times the volume. Nothing scrolled, nothing that mattered was pushed off.
</p>`,
  }),
  { alerts: 341, alertsTone: C.danger }
);

// --- QuietNight: what you actually see most evenings ------------------------

const quietNight = overview(
  board({
    strip: {
      deadline: '2d 6h',
      deadlineNote: 'Nothing due before Thursday',
      deadlineTone: C.text,
      training: 'Caldari Battleship V',
      trainingNote: '1d 4h left · 6 skills queued',
      wallet: '1,284,902,441 ISK',
    },
    cards: [
      ordersCard({ undercut: 0, outbid: 0, relist: 0, floor: 0, slots: '24 of 41 slots used' }),
      miningCard({ unpaid: '0', payees: 4, unassigned: 0, note: 'last settled 2 days ago' }),
      planetaryCard({
        rows: [
          {
            sev: 'clear',
            when: '2d 6h',
            subject: '8 colonies extracting',
            detail: 'Next batch ends Thursday — one reset run',
            short: { subject: '8 colonies extracting', detail: 'Next batch Thursday' },
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
      }),
      industryCard({
        worst: 'clear',
        rows: [
          {
            sev: 'clear',
            when: '5h 40m',
            subject: '6 jobs running',
            detail: 'Next delivery Fermionic Condensates ×2',
            short: { subject: '6 jobs running', detail: 'Next: Fermionic ×2' },
          },
          {
            sev: 'clear',
            when: '2d 3h',
            subject: 'Ishtar ×1',
            detail: 'Manufacturing · Sotiyo',
            short: { subject: 'Ishtar ×1', detail: 'Manufacturing · Sotiyo' },
          },
        ],
        footer: 'Nothing waiting to be delivered',
      }),
    ],
    alerts: {
      unread: 0,
      rows: [
        {
          sev: 'clear',
          when: '2',
          subject: 'Market order filled',
          detail: 'Newest 2d — already read',
          short: { subject: 'Market order filled', detail: 'Newest 2d' },
        },
      ],
      footer: 'Nothing new since Tuesday',
    },
    others: [
      ['Sera Vantis', 'clear', 'nothing needs you'],
      ['Orrin Kade', 'clear', 'nothing needs you'],
      ['Tal Rhoem', 'clear', 'nothing needs you'],
    ],
    note: `<p style="${S.microDim}">The state you are in most evenings. Every card still says what it checked, so a quiet board is never mistaken for a broken one — and a zero is plain text, not an amber number sending you to look at nothing.</p>`,
  }),
  { height: 760, alerts: 0 }
);

// --- AlertsPage: where all those notifications actually go ------------------
//
// Today the feed lives only inside `routes/Overview.tsx`. Summarising it into a
// column on the board would strand everything the column does not list, so it
// needs a page of its own: every type, every Character, searchable, with the
// per-type controls `NotificationContextMenu` already offers.

function groupRow({ sev, count, type, newest, muted = false, expanded = false, last = false }) {
  const s = SEV[sev];
  return `<li style="display: flex; min-height: 44px; align-items: center; gap: 12px; border-bottom: 1px solid ${C.line}; padding: 0 12px;${last ? ' border-bottom: 0;' : ''}${expanded ? ` background: ${C.panel2};` : ''}">
  <span style="display: inline-flex; width: 12px; flex-shrink: 0; justify-content: center; color: ${C.dim};">${icon(expanded ? 'expanded' : 'caret', 12)}</span>
  <span style="display: flex; width: 60px; flex-shrink: 0; align-items: center; gap: 5px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: ${s.color};">${icon(s.glyph, 16)}${count}</span>
  <span style="min-width: 0; flex: 1; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; color: ${muted ? C.dim : C.text};">${type}${muted ? `<span style="${S.microDim}"> · muted</span>` : ''}</span>
  <span style="flex-shrink: 0; font-size: 12px; font-variant-numeric: tabular-nums; color: ${C.dim};">newest ${newest}</span>
  <span style="display: flex; flex-shrink: 0; gap: 6px; color: ${C.dim};">${icon('bellOff', 16)}${icon('close', 16)}</span>
</li>`;
}

function fireRow({ body, who, when, last = false }) {
  return `<li style="display: flex; align-items: center; gap: 12px; border-bottom: 1px solid ${C.line}; padding: 7px 12px 7px 40px;${last ? ' border-bottom: 0;' : ''}">
  <span style="min-width: 0; flex: 1; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; color: ${C.dim};">${body}</span>
  <span style="display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; ${S.microDim}">${avatar(20, who[1])}${who[0]}</span>
  <span style="width: 72px; flex-shrink: 0; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: ${C.dim};">${when}</span>
  <span style="flex-shrink: 0; color: ${C.dim};">${icon('close', 16)}</span>
</li>`;
}

const alertsPage = desktop(
  `
<header style="display: flex; min-height: 36px; flex-wrap: wrap; align-items: center; gap: 10px;">
  <h1 style="font-size: 20px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">Alerts</h1>
  <span style="${S.microDim}">341 unread · 17 types · 4 characters</span>
  <span style="margin-left: auto; display: flex; align-items: center; gap: 6px;">
    ${ageBadge('40s')}
    <span style="display: inline-flex; height: 36px; align-items: center; border: 1px solid ${C.line}; border-radius: 2px; padding: 0 16px; ${S.micro} font-size: 12px;">Notification settings</span>
    <span style="display: inline-flex; height: 36px; align-items: center; border: 1px solid ${C.line}; border-radius: 2px; padding: 0 16px; ${S.micro} font-size: 12px;">Dismiss all</span>
  </span>
</header>

<div style="display: flex; align-items: center; gap: 8px;">
  <span style="display: inline-flex; height: 36px; width: 260px; align-items: center; gap: 8px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panel2}; padding: 0 10px; font-size: 14px; color: ${C.faint};">${icon('search', 16)}Search alerts</span>
  <span style="display: inline-flex; height: 36px; align-items: center; gap: 8px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panel2}; padding: 0 10px; font-size: 14px;">All characters ${icon('expanded', 12)}</span>
  ${filterChip('Unread', 341, true)}
  ${filterChip('Critical', 23)}
  ${filterChip('Warning', 6)}
  ${filterChip('Muted types', 3)}
  <span style="margin-left: auto; ${S.microDim}">Grouped by type · worst first</span>
</div>

<section style="${S.panel}">
  ${panelHeader({
    title: 'By type',
    meta: `<span style="${S.microDim}">Every character on this device — the board is the active one only</span>`,
  })}
  <ul>
    ${groupRow({ sev: 'critical', count: 19, type: 'Structure under attack', newest: '4m', expanded: true })}
    ${fireRow({ body: 'Athanor · Gehi IV — Moon 1 is under attack', who: ['Kaelen Vor', 'KV'], when: '4m ago' })}
    ${fireRow({ body: 'Raitaru · Ahbazon III is under attack', who: ['Sera Vantis', 'SV'], when: '18m ago' })}
    ${fireRow({ body: 'Athanor · Gehi IV — Moon 1 is under attack', who: ['Kaelen Vor', 'KV'], when: '1h ago' })}
    ${fireRow({ body: 'Azbel · Hykkota VII is under attack', who: ['Orrin Kade', 'OK'], when: '3h ago', last: true })}
    ${groupRow({ sev: 'critical', count: 4, type: 'Structure reinforcement exit', newest: '22m' })}
    ${groupRow({ sev: 'warning', count: 6, type: 'Structure fuel low', newest: '1h' })}
    ${groupRow({ sev: 'watch', count: 31, type: 'Skill training complete', newest: '9h' })}
    ${groupRow({ sev: 'watch', count: 18, type: 'Contract accepted', newest: '30m' })}
    ${groupRow({ sev: 'clear', count: 284, type: 'Market order filled', newest: '1m' })}
    ${groupRow({ sev: 'clear', count: 9, type: 'Wallet balance changed', newest: '3m' })}
    ${groupRow({ sev: 'clear', count: 12, type: 'Corp member joined', newest: '2d', muted: true, last: true })}
  </ul>
  <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim}">+6 more types · the device keeps the last 300 alerts, and 30 days of them sync between your devices</p>
</section>

<p style="${S.microDim}">A tapped push with no route of its own lands here instead of on the dashboard.</p>`,
  { alerts: 341, alertsTone: C.danger, active: 'Alerts', height: 760 }
);

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
    ${numberTile({ label: 'Relist', value: 0, sev: 'watch' })}
  </div>
</div>`,
      'Twenty-one undercut orders is one fact, not twenty-one. Each tile opens Orders already filtered. A zero drops the tone and the glyph — nothing to look at is not a warning.'
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
      'The feed already carries eventId (and eveType for EVE-native ones). Grouping on it turns 341 alerts into a dozen rows, worst type first — on the board and on the Alerts page.'
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
    { file: 'Main.dc.html', title: 'The board — Desktop', x: 0, y: 0, w: 1440, h: 900 },
    { file: 'HeavyDay.dc.html', title: 'Heavy day — same layout', x: 1560, y: 0, w: 1440, h: 900 },
    { file: 'QuietNight.dc.html', title: 'Quiet night', x: 3120, y: 0, w: 1440, h: 760 },
    {
      file: 'AlertsPage.dc.html',
      title: 'Alerts — the feed’s new home',
      x: 0,
      y: 1060,
      w: 1440,
      h: 760,
    },
    { file: 'BoardPhone.dc.html', title: 'The board — Phone', x: 1560, y: 1060, w: 390, h: 844 },
    { file: 'Anatomy.dc.html', title: 'Card anatomy & rules', x: 2070, y: 1060, w: 1440, h: 420 },
  ],
  annotations: [
    {
      id: 'round3',
      x: 0,
      y: -300,
      w: 520,
      text: 'ROUND 3 — what changed\n\n· Alerts get the column. The card variant is gone (still in git history).\n\n· A zero is plain text now — no amber, no glyph. Nothing to look at is not a warning. See Quiet night.\n\n· "You owe" is off the strip: it printed the same ISK as the Mining tax card\'s own tile, two panels apart.\n\n· The rail gains an Alerts entry with an unread count — the feed had no way to be reached from anywhere but the dashboard.',
    },
    {
      id: 'feed-question',
      x: 0,
      y: 1900,
      w: 560,
      text: 'WHERE THE NOTIFICATIONS WENT\n\nToday the Notification Feed renders in exactly one place: inside routes/Overview.tsx. No page, no nav entry, and NOTIFICATION_FALLBACK_ROUTE is /overview — so a tapped push with no route of its own lands on the dashboard.\n\nSummarising it into a column would have stranded everything the column does not list. So the feed gets a page:\n\n· Every type, every Character on the device — the board is active-character-only, the feed never was\n· Search, character filter, severity and muted-type filters\n· Expand a type to see its individual fires, each with who it belongs to and its own dismiss\n· Mute a type or dismiss the whole group from the row — the controls NotificationContextMenu already offers\n· Links out to Settings for the per-event toggles, which stay where they are\n\nThe column on the board is the summary; this is the detail. That is the relationship every other card on the board has with its page — alerts were the only domain without one.',
    },
    {
      id: 'still-open',
      x: 1560,
      y: 1940,
      w: 420,
      text: 'STILL OPEN\n\n1. Multi-character. The board is the active pilot; the feed is device-wide. The "your other characters" line is a proposal, not a decision.\n\n2. Deep links. "Undercut 21" would open /market?section=orders — no route today opens it pre-filtered to undercut, or jumps to one colony.\n\n3. Does this replace Overview, or sit above it? The wallet panel, skill-queue panel and count tiles are all gone.\n\n4. Where does Alerts sit in the rail? Drawn directly under Overview; the Social group (mail, calendar, contacts) is the other candidate.',
    },
  ],
  launch: { view: 'canvas' },
};

// --- Write -----------------------------------------------------------------

const files = {
  'Main.dc.html': main,
  'HeavyDay.dc.html': heavyDay,
  'QuietNight.dc.html': quietNight,
  'AlertsPage.dc.html': alertsPage,
  'BoardPhone.dc.html': boardPhone,
  'Anatomy.dc.html': anatomy,
  'canvas.json': `${JSON.stringify(canvas, null, 2)}\n`,
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content, 'utf8');
}
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);

/**
 * Emits the seven `.dc.html` artboards for the Overview triage-page review.
 *
 * Three concepts, each at 1440x900 (desktop) and 390x844 (phone), plus one
 * shared States board — the all-clear, missing-scope, stale and empty-queue
 * cases the three concepts all have to answer and which a mockup usually omits.
 *
 * Sample data is the same set of eleven attention items across all three, so
 * the concepts differ on organising principle and nothing else.
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
  characterHeader,
  filterChip,
  icon,
  panelHeader,
  rail,
  refreshButton,
  subNav,
  triageRow,
} from './parts.mjs';

const OUT = dirname(fileURLToPath(import.meta.url));

// --- The sample desk -------------------------------------------------------
// Every row names a real signal the codebase already computes, and the route
// it navigates to. `src` is not drawn; it is the note this mockup answers to.

const ITEMS = [
  {
    sev: 'critical',
    when: 'Idle 6h',
    subject: 'Gehi V — Barren · 2 extractor programs',
    detail: 'Expired — nothing is being extracted',
    dest: 'Planetary',
    domain: 'pi',
    short: { subject: 'Gehi V — Barren', detail: '2 programs expired' },
    src: "colonyAttention 'idle'",
  },
  {
    sev: 'critical',
    when: '−12.4%',
    subject: 'Nanite Repair Paste ×420 — sell',
    detail: 'Under your cost floor at Jita IV-4',
    dest: 'Orders',
    domain: 'orders',
    short: { subject: 'Nanite Repair Paste — sell', detail: 'Under your floor' },
    src: "OpenOrderRow.problem 'belowFloor'",
  },
  {
    sev: 'warning',
    when: '3h 12m',
    subject: 'Gehi IV — Lava · extractor program ends',
    detail: 'Reset run due inside your 24h window',
    dest: 'Planetary',
    domain: 'pi',
    short: { subject: 'Gehi IV — Lava', detail: 'Program ends' },
    src: "extractorState 'expiring-soon'",
  },
  {
    sev: 'warning',
    when: 'Ready',
    subject: '4 manufacturing jobs ready to deliver',
    detail: 'Oldest finished 2d 4h ago — Sotiyo, Ahbazon',
    dest: 'Industry',
    domain: 'jobs',
    short: { subject: '4 jobs ready to deliver', detail: 'Oldest 2d 4h ago' },
    src: 'isJobDone',
  },
  {
    sev: 'warning',
    when: 'Review',
    subject: '3 mining assignments need review',
    detail: 'Ledger grew after assignment — +18,400 units',
    dest: 'Mining Tax',
    domain: 'moon',
    short: { subject: '3 assignments need review', detail: 'Ledger grew after assignment' },
    src: "MiningTaxAssignmentStatus 'needs-review'",
  },
  {
    sev: 'warning',
    when: '+0.8%',
    subject: 'Tritanium ×2,400,000 — buy',
    detail: 'Outbid at Amarr VIII (Oris) — Emperor Family',
    dest: 'Orders',
    domain: 'orders',
    short: { subject: 'Tritanium — buy', detail: 'Outbid at Amarr VIII' },
    src: "OpenOrderRow.problem 'outbid'",
  },
  {
    sev: 'watch',
    when: '1d 4h',
    subject: 'Caldari Battleship V',
    detail: 'Queue: 6 skills · 18d 6h to the end',
    dest: 'Skills',
    domain: 'training',
    short: { subject: 'Caldari Battleship V', detail: '6 skills · 18d 6h left' },
    src: 'selectActiveEntryFromSorted + selectQueueDepth',
  },
  {
    sev: 'watch',
    when: '5h 40m',
    subject: 'Fermionic Condensates ×2 — reaction',
    detail: 'Sotiyo, Ahbazon',
    dest: 'Industry',
    domain: 'jobs',
    short: { subject: 'Fermionic Condensates ×2', detail: 'Reaction · Sotiyo' },
    src: 'isCompletingSoon',
  },
  {
    sev: 'watch',
    when: '2d 6h',
    subject: '2 sell orders expire',
    detail: 'Relist, or let them lapse',
    dest: 'Orders',
    domain: 'orders',
    short: { subject: '2 sell orders expire', detail: 'Relist or let them lapse' },
    src: "OpenOrderRow.problem 'expiringOrStale'",
  },
  {
    sev: 'watch',
    when: 'New',
    subject: 'Structure under attack — Athanor, Gehi IV',
    detail: 'EVE notification · 40m ago',
    dest: 'Alerts',
    domain: 'alerts',
    short: { subject: 'Structure under attack', detail: 'Athanor, Gehi IV · 40m' },
    src: "NotificationFeedRecord eventId 'eveNotification'",
  },
  {
    sev: 'watch',
    when: 'New',
    subject: 'Contract accepted — Jita → Amarr courier',
    detail: 'Notification feed · 3h ago',
    dest: 'Alerts',
    domain: 'alerts',
    short: { subject: 'Contract accepted', detail: 'Jita → Amarr courier · 3h' },
    src: "NotificationFeedRecord eventId 'contractAccepted'",
  },
];

const byId = (n) => ITEMS[n];

/**
 * The calm rows. A domain card that only ever lists problems tells you nothing
 * when it is quiet, so each card also carries what is simply *running* — which
 * is what `clear` is for (`CorpBoardRow`: "not an achievement, just not today's
 * problem").
 */
const CALM = {
  nextSkill: {
    sev: 'clear',
    when: 'Then',
    subject: 'Advanced Weapon Upgrades V',
    detail: 'Starts when Caldari Battleship V lands',
    dest: 'Skills',
    short: { subject: 'Advanced Weapon Upgrades V', detail: 'Next in queue' },
  },
  remap: {
    sev: 'clear',
    when: 'Remap',
    subject: 'A neural remap is available',
    detail: 'Last remapped 412 days ago',
    dest: 'Skills',
    short: { subject: 'Neural remap available', detail: 'Last used 412d ago' },
  },
  runningJob: {
    sev: 'clear',
    when: '2d 3h',
    subject: 'Ishtar ×1 — manufacturing',
    detail: 'Sotiyo, Ahbazon',
    dest: 'Industry',
    short: { subject: 'Ishtar ×1', detail: 'Manufacturing · Sotiyo' },
  },
  decayed: {
    sev: 'clear',
    when: 'Decayed',
    subject: 'Gehi VII — Storm',
    detail: 'Output down 68% since install — a reset would pay',
    dest: 'Planetary',
    short: { subject: 'Gehi VII — Storm', detail: 'Output down 68%' },
  },
  unassigned: {
    sev: 'watch',
    when: 'Ledger',
    subject: '12 entries with no payee',
    detail: 'Gehi IV — Athanor, last 3 days',
    dest: 'Mining Tax',
    short: { subject: '12 entries, no payee', detail: 'Athanor · last 3 days' },
  },
  settled: {
    sev: 'clear',
    when: 'Settled',
    subject: 'Vex Orlenard — 84.2M ISK',
    detail: 'Matched to your wallet journal 2 days ago',
    dest: 'Mining Tax',
    short: { subject: 'Vex Orlenard — 84.2M', detail: 'Matched 2d ago' },
  },
  skillDone: {
    sev: 'clear',
    when: '6h',
    subject: 'Drone Interfacing V finished',
    detail: 'Notification feed · dismissed on read',
    dest: 'Alerts',
    short: { subject: 'Drone Interfacing V done', detail: 'Feed · 6h ago' },
  },
};

/** The reauth line every concept has to carry somewhere. */
function reauthFooter() {
  return `<div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid ${C.line}; padding: 6px 12px;">
  <span style="${S.microDim}">2 lower-priority items hidden</span>
  <span style="display: inline-flex; align-items: center; gap: 8px;">
    <span style="${S.micro} color: ${C.warning};">Contracts not checked — scope missing</span>
    <span style="display: inline-flex; height: 28px; align-items: center; border: 1px solid ${C.line}; border-radius: 2px; padding: 0 10px; ${S.micro}">Sign in again</span>
  </span>
</div>`;
}

/** Severity tallies, in the panel's `meta` slot — colour AND word, never colour alone. */
function severityMeta(counts) {
  const part = (sev, n) =>
    `<span style="display: inline-flex; align-items: center; gap: 4px; color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 12)}<span style="font-variant-numeric: tabular-nums;">${n}</span> ${SEV[sev].word}</span>`;
  return `<span style="display: inline-flex; align-items: center; gap: 10px; ${S.micro}">${Object.entries(
    counts
  )
    .map(([sev, n]) => part(sev, n))
    .join(`<span style="color: ${C.faint};">·</span>`)}</span>`;
}

/**
 * The same tally where the header has no room for three of them — a card in a
 * three-up grid, or a phone. Worst severity, named, plus the total.
 */
function worstMeta(sev, total) {
  return `<span style="display: inline-flex; align-items: center; gap: 4px; ${S.micro} color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 12)}${SEV[sev].word}<span style="color: ${C.dim};">· ${total}</span></span>`;
}

/** The card header's own link out, since its rows no longer carry one each. */
function openLink(label) {
  return `<span style="display: inline-flex; align-items: center; gap: 4px; ${S.micro} color: ${C.accent};">${label}${icon('caret', 12)}</span>`;
}

// --- Shells ----------------------------------------------------------------

function desktop(body) {
  return artboard({
    width: 1440,
    height: 900,
    body: `${rail(900)}
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
    body: `<div style="display: flex; width: 100%; flex-direction: column; gap: 16px; padding: 16px 16px 61px;">
  ${characterHeader()}
  ${subNav(true)}
  ${body}
</div>
${bottomBar()}`,
  });
}

// --- Concept A — Action Queue ---------------------------------------------
// One list, every domain merged, ordered by severity then by clock. The whole
// page is the ordering; the domain is a tag on the row, not a container.

const conceptADesktop = desktop(`
<section style="${S.panel}">
  ${panelHeader({
    title: 'Needs attention',
    meta: severityMeta({ critical: 2, warning: 4, watch: 5 }),
    actions: `${ageBadge('4m')}${refreshButton()}`,
  })}
  <div style="display: flex; align-items: center; gap: 6px; border-bottom: 1px solid ${C.line}; padding: 8px 12px;">
    ${filterChip('All', 11, true)}
    ${filterChip('Training', 1)}
    ${filterChip('Orders', 3)}
    ${filterChip('Jobs', 2)}
    ${filterChip('Planetary', 2)}
    ${filterChip('Mining tax', 1)}
    ${filterChip('Alerts', 2)}
    <span style="margin-left: auto; ${S.microDim}">Sorted by severity, then by clock</span>
  </div>
  <ul>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => triageRow(byId(i))).join('\n')}
  </ul>
  ${reauthFooter()}
</section>

<section style="${S.panel}">
  ${panelHeader({
    title: 'Your other characters',
    meta: `<span style="${S.microDim}">· The board above is this character only</span>`,
  })}
  <div style="display: flex; align-items: center; gap: 24px; padding: 12px;">
    ${altPill('Sera Vantis', 'SV', 'critical', 'Nothing in training — 2d 4h')}
    ${altPill('Orrin Kade', 'OK', 'warning', '2 colonies expiring inside 6h')}
    ${altPill('Tal Rhoem', 'TR', 'clear', 'Nothing needs you')}
  </div>
</section>`);

function altPill(name, initials, sev, detail) {
  const s = SEV[sev];
  return `<span style="display: inline-flex; min-width: 0; align-items: center; gap: 8px;">
  ${avatar(28, initials)}
  <span style="min-width: 0;">
    <span style="display: block; font-size: 13px; line-height: 18px;">${name}</span>
    <span style="display: flex; align-items: center; gap: 4px; font-size: 11px; line-height: 15px; color: ${s.color};">${icon(s.glyph, 12)}${detail}</span>
  </span>
</span>`;
}

const conceptAPhone = phone(`
<section style="${S.panel}">
  ${panelHeader({
    title: 'Needs you',
    meta: worstMeta('critical', 11),
    actions: refreshButton(true),
    touch: true,
  })}
  <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; border-bottom: 1px solid ${C.line}; padding: 8px 12px;">
    ${filterChip('All', 11, true, true)}
    ${filterChip('Training', 1, false, true)}
    ${filterChip('Orders', 3, false, true)}
    ${filterChip('Jobs', 2, false, true)}
  </div>
  <ul>
    ${[0, 1, 2, 3, 4].map((i) => triageRow({ ...byId(i), touch: true })).join('\n')}
  </ul>
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid ${C.line}; padding: 8px 12px;">
    <span style="${S.microDim}">6 more</span>
    <span style="${S.micro} color: ${C.warning};">Contracts — scope missing</span>
  </div>
</section>

<div style="display: flex; height: 44px; align-items: center; gap: 12px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panelGlass}; padding: 0 12px;">
  <span style="${S.microDim}">Others</span>
  ${[
    ['Sera Vantis', 'critical'],
    ['Orrin Kade', 'warning'],
    ['Tal Rhoem', 'clear'],
  ]
    .map(
      ([name, sev]) =>
        `<span style="display: inline-flex; min-width: 0; align-items: center; gap: 4px; font-size: 12px; color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 14)}<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</span></span>`
    )
    .join('')}
  <span style="margin-left: auto; color: ${C.accent};">${icon('caret', 12)}</span>
</div>`);

// --- Concept B — Station Board --------------------------------------------
// One panel per domain, each showing only its exceptions. Deliberately the
// same anatomy as the Corp ops board's Kind Cards, which already works.

/**
 * One domain card. Rows carry no destination of their own — the card's header
 * link is the destination, the same call `CorpKindCards` makes — which is what
 * gives a 373px column enough width for the subject to survive.
 */
function domainCard({ title, worst, total, open, items, footer = '', touch = false }) {
  const rows = items
    .map((it, i) =>
      triageRow({ ...it, compact: !touch, touch, noDest: true, last: i === items.length - 1 })
    )
    .join('\n');
  return `<section style="${S.panel} min-width: 0;">
  ${panelHeader({
    title,
    meta: worst ? worstMeta(worst, total) : '',
    actions: openLink(open),
    touch,
  })}
  <ul>${rows}</ul>
  ${footer ? `<p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim} font-variant-numeric: tabular-nums;">${footer}</p>` : ''}
</section>`;
}

function summaryStrip() {
  const cell = (label, value, tone) =>
    `<span style="display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px;">
  <span style="${S.microDim}">${label}</span>
  <span style="font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; color: ${tone};">${value}</span>
</span>`;
  return `<section style="${S.panel}">
  <div style="display: flex; align-items: center; gap: 24px; padding: 12px;">
    ${cell('Needs you', '11 items', C.text)}
    ${cell('Worst', '2 critical', C.danger)}
    ${cell('Next deadline', '3h 12m — Gehi IV', C.warning)}
    ${cell('Wallet', '1,284,902,441 ISK', C.iskPos)}
    ${cell('Owed to you', '412,600,000 ISK', C.iskPos)}
    <span style="display: flex; align-items: center; gap: 8px;">${ageBadge('4m')}${refreshButton()}</span>
  </div>
</section>`;
}

const conceptBDesktop = desktop(`
${summaryStrip()}
<div style="display: grid; min-width: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 12px;">
  ${domainCard({
    title: 'Training',
    worst: 'watch',
    total: 1,
    open: 'Skills',
    items: [byId(6), CALM.nextSkill, CALM.remap],
    footer: '6 skills queued · ends 24 Sep 18:40',
  })}
  ${domainCard({
    title: 'Open orders',
    worst: 'critical',
    total: 3,
    open: 'Orders',
    items: [byId(1), byId(5), byId(8)],
    footer: '18 orders healthy · 24 of 41 slots used',
  })}
  ${domainCard({
    title: 'Industry jobs',
    worst: 'warning',
    total: 2,
    open: 'Industry',
    items: [byId(3), byId(7), CALM.runningJob],
    footer: '6 running · next delivery 5h 40m',
  })}
  ${domainCard({
    title: 'Planetary industry',
    worst: 'critical',
    total: 2,
    open: 'Planetary',
    items: [byId(0), byId(2), CALM.decayed],
    footer: '5 colonies · 2 healthy',
  })}
  ${domainCard({
    title: 'Mining tax',
    worst: 'warning',
    total: 2,
    open: 'Mining Tax',
    items: [byId(4), CALM.unassigned, CALM.settled],
    footer: '412.6M ISK outstanding across 4 payees',
  })}
  ${domainCard({
    title: 'Alerts',
    worst: 'watch',
    total: 2,
    open: 'Settings',
    items: [byId(9), byId(10), CALM.skillDone],
    footer: 'Dismissed here and on your other devices',
  })}
</div>
<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.warning};"></span>
  Contracts has no card: the scope is missing. Sign in again to restore it.
</p>`);

const conceptBPhone = phone(`
${domainCard({
  title: 'Training',
  worst: 'watch',
  total: 1,
  open: 'Skills',
  items: [byId(6)],
  touch: true,
})}
${domainCard({
  title: 'Open orders',
  worst: 'critical',
  total: 3,
  open: 'Orders',
  items: [byId(1), byId(5)],
  touch: true,
})}
<section style="${S.panel}">
  ${panelHeader({ title: 'Everything else', touch: true })}
  ${[
    ['Planetary industry', 'critical', '1 idle, 1 expiring in 3h'],
    ['Industry jobs', 'warning', '4 ready to deliver'],
    ['Mining tax', 'warning', '3 need review'],
    ['Alerts', 'watch', '2 new'],
  ]
    .map(
      ([label, sev, detail], i, all) =>
        `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px;${i === all.length - 1 ? '' : ` border-bottom: 1px solid ${C.line};`}">
  <span style="color: ${SEV[sev].color};">${icon(SEV[sev].glyph, 16)}</span>
  <span style="min-width: 0; flex: 1; font-size: 13px;">${label}</span>
  <span style="font-size: 12px; color: ${C.dim};">${detail}</span>
  <span style="color: ${C.accent};">${icon('caret', 12)}</span>
</div>`
    )
    .join('\n')}
</section>`);

// --- Concept C — Next 48 Hours --------------------------------------------
// Time is the spine. A deadline strip over the next 48 hours, then buckets by
// when a thing lands — and one honest panel for everything that has no clock.

function deadlineStrip({ buckets, barHeight, labelEvery }) {
  const busiest = buckets.reduce((max, b) => Math.max(max, b.count), 0);
  const FILL = {
    critical: C.danger,
    warning: C.warning,
    watch: C.accent,
    clear: C.dim,
  };
  const legend = ['critical', 'warning', 'watch', 'clear']
    .map(
      (sev) =>
        `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: ${C.dim};"><span style="width: 8px; height: 8px; background: ${FILL[sev]};"></span>${SEV[sev].word}</span>`
    )
    .join('');
  const bars = buckets
    .map((b) => {
      const pct = b.count === 0 ? 0 : Math.max(12, Math.round((b.count / busiest) * 100));
      return `<div style="display: flex; min-width: 0; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%;">
  ${b.count > 0 ? `<span style="font-size: 11px; font-variant-numeric: tabular-nums; color: ${C.dim};">${b.count}</span>` : ''}
  <div style="width: 100%; height: ${pct}%; background: ${b.count === 0 ? 'transparent' : FILL[b.sev]}; opacity: ${b.count === 0 ? 1 : 0.9};"></div>
</div>`;
    })
    .join('');
  const labels = buckets
    .map(
      (b, i) =>
        `<span style="min-width: 0; flex: 1; text-align: center; font-size: 10px; font-variant-numeric: tabular-nums; color: ${i % labelEvery === 0 ? C.dim : 'transparent'};">${b.label}</span>`
    )
    .join('');
  return `<div style="display: flex; flex-direction: column; gap: 8px; padding: 12px;">
  <div style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px;">
    <h3 style="${S.microDim}">Next 48 hours, in 3-hour steps</h3>
    <span style="display: flex; gap: 12px;">${legend}</span>
  </div>
  <div style="display: flex; align-items: flex-end; gap: 4px; height: ${barHeight}px; border-bottom: 1px solid ${C.line};">${bars}</div>
  <div style="display: flex; gap: 4px;">${labels}</div>
</div>`;
}

const BUCKETS = [
  { label: 'now', count: 2, sev: 'critical' },
  { label: '03', count: 1, sev: 'warning' },
  { label: '06', count: 2, sev: 'watch' },
  { label: '09', count: 0, sev: 'clear' },
  { label: '12', count: 1, sev: 'watch' },
  { label: '15', count: 0, sev: 'clear' },
  { label: '18', count: 3, sev: 'warning' },
  { label: '21', count: 1, sev: 'watch' },
  { label: '24', count: 0, sev: 'clear' },
  { label: '27', count: 2, sev: 'watch' },
  { label: '30', count: 1, sev: 'watch' },
  { label: '33', count: 0, sev: 'clear' },
  { label: '36', count: 0, sev: 'clear' },
  { label: '39', count: 4, sev: 'warning' },
  { label: '42', count: 1, sev: 'watch' },
  { label: '45', count: 0, sev: 'clear' },
];

function bucketHeader(label, count) {
  return `<li style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid ${C.line}; background: ${C.panel2}; padding: 4px 12px;">
  <span style="${S.microDim}">${label}</span>
  <span style="${S.microDim} font-variant-numeric: tabular-nums;">${count}</span>
</li>`;
}

const conceptCDesktop = desktop(`
<section style="${S.panel}">
  ${panelHeader({
    title: 'What lands when',
    meta: severityMeta({ critical: 2, warning: 4, watch: 5 }),
    actions: `${ageBadge('4m')}${refreshButton()}`,
  })}
  ${deadlineStrip({ buckets: BUCKETS, barHeight: 96, labelEvery: 2 })}
</section>

<div style="display: grid; min-width: 0; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; gap: 16px;">
  <section style="${S.panel}">
    ${panelHeader({ title: 'On the clock' })}
    <ul>
      ${bucketHeader('Overdue', 1)}
      ${triageRow(byId(0))}
      ${bucketHeader('Next 6 hours', 2)}
      ${triageRow(byId(2))}
      ${triageRow(byId(7))}
      ${bucketHeader('Tomorrow', 2)}
      ${triageRow(byId(6))}
      ${triageRow({ ...byId(8), last: true })}
    </ul>
    <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim}">Nothing else has a deadline before Thursday</p>
  </section>

  <section style="${S.panel}">
    ${panelHeader({
      title: 'No clock',
      meta: `<span style="${S.microDim}">· Waits for you, not a timer</span>`,
    })}
    <ul>
      ${[1, 5, 3, 4, 9]
        .map((i, n, all) => triageRow({ ...byId(i), compact: true, last: n === all.length - 1 }))
        .join('\n')}
    </ul>
    <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim}">Roughly half the board lives here — this is the concept’s cost</p>
  </section>
</div>

<p style="${S.microDim} display: flex; align-items: center; gap: 8px;">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.warning};"></span>
  Contracts is not on either list: the scope is missing, so nothing about it is known.
</p>`);

const conceptCPhone = phone(`
<section style="${S.panel}">
  ${panelHeader({ title: 'What lands when', meta: severityMeta({ critical: 2, warning: 4 }), touch: true })}
  ${deadlineStrip({ buckets: BUCKETS.slice(0, 8), barHeight: 64, labelEvery: 2 })}
</section>

<section style="${S.panel}">
  ${panelHeader({ title: 'On the clock', touch: true })}
  <ul>
    ${bucketHeader('Overdue', 1)}
    ${triageRow({ ...byId(0), touch: true })}
    ${bucketHeader('Next 6 hours', 2)}
    ${triageRow({ ...byId(2), touch: true })}
    ${triageRow({ ...byId(7), touch: true, last: true })}
  </ul>
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid ${C.line}; padding: 8px 12px;">
    <span style="${S.micro} color: ${C.accent};">No clock — 5 waiting on you</span>
    <span style="color: ${C.accent};">${icon('caret', 12)}</span>
  </div>
</section>`);

// --- States ----------------------------------------------------------------
// The four states the concepts share, drawn once. All three inherit these.

function stateCard(title, body, note) {
  return `<section style="${S.panel} display: flex; min-width: 0; flex: 1; flex-direction: column;">
  ${panelHeader({ title })}
  <div style="flex: 1;">${body}</div>
  <p style="border-top: 1px solid ${C.line}; padding: 8px 12px; font-size: 11px; line-height: 15px; color: ${C.dim};">${note}</p>
</section>`;
}

function emptyState(title, hint, glyph, color) {
  return `<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 16px; text-align: center;">
  <span style="color: ${color};">${icon(glyph, 28)}</span>
  <p style="font-size: 14px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.dim};">${title}</p>
  <p style="max-width: 24rem; font-size: 12px; line-height: 16px; color: ${C.dim};">${hint}</p>
</div>`;
}

const states = artboard({
  width: 1440,
  height: 450,
  body: `<div style="display: flex; width: 100%; flex-direction: column; gap: 16px; padding: 24px;">
  <div>
    <h1 style="font-size: 20px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">States every concept inherits</h1>
    <p style="margin-top: 4px; font-size: 12px; color: ${C.dim};">Drawn once rather than three times — the row vocabulary, the severity ladder and these four states are shared; only the arrangement differs between A, B and C.</p>
  </div>

  <div style="display: flex; align-items: stretch; gap: 16px;">
    ${stateCard(
      'All clear',
      emptyState(
        'Nothing needs you right now',
        'Training runs for 18d · 5 colonies healthy · 24 orders at the front · no job overdue. Checked 4 minutes ago.',
        'clear',
        C.success
      ),
      'The most common state, and the one a triage page has to earn. It names what it checked, so an empty board is not mistaken for a broken one.'
    )}
    ${stateCard(
      'Scope missing',
      `<div style="padding: 12px 12px 16px;">
  <p style="font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.warning};">Contracts can’t be checked</p>
  <p style="margin-top: 8px; font-size: 12px; line-height: 16px; color: ${C.dim};">This character has not granted the contracts scope, so the board is silent about it rather than clear.</p>
  <span style="display: inline-flex; margin-top: 12px; height: 36px; align-items: center; border: 1px solid ${C.accent}; border-radius: 2px; background: ${C.accent}; padding: 0 16px; ${S.micro} font-size: 12px; color: ${C.accentContrast};">Sign in again</span>
</div>`,
      'Never an empty list. A domain that could not be read says so on the board — silence is the failure mode the current Overview already has.'
    )}
    ${stateCard(
      'Stale / offline',
      `<ul>
  ${triageRow({ ...byId(2), compact: true, last: true })}
</ul>
<div style="display: flex; align-items: center; gap: 8px; border-top: 1px solid ${C.line}; padding: 8px 12px;">
  ${ageBadge('2d', C.danger)}
  <span style="${S.micro} color: ${C.warning};">Offline — showing last fetch</span>
</div>`,
      'Countdowns keep ticking off a two-day-old fetch unless the age is on screen. The badge is the same one every ESI panel carries.'
    )}
    ${stateCard(
      'Nothing training',
      `<ul>
  ${triageRow({
    sev: 'critical',
    when: 'Empty',
    subject: 'Nothing in training',
    detail: 'Queue empty for 2d 4h',
    dest: 'Skills',
    compact: true,
    short: { subject: 'Nothing in training', detail: 'Empty for 2d 4h' },
    last: true,
  })}
</ul>
<div style="padding: 12px;">
  <p style="font-size: 12px; line-height: 16px; color: ${C.dim};">An empty queue is the one “absence” that is itself critical — <span style="color: ${C.text};">characterNotTraining</span> already fires as a notification; here it is a row.</p>
</div>`,
      'The inverse of a normal alert: what makes it urgent is that nothing is happening. Sorted with the criticals, not tucked under Training.'
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
    <span style="font-size: 11px; color: ${C.dim};">Four tones, four outlines — the same ladder <span style="color: ${C.text};">CorpBoardRow</span> already uses, so colour is never the only signal.</span>
  </div>
</div>`,
});

// --- canvas.json -----------------------------------------------------------

const canvas = {
  artboards: [
    { file: 'Main.dc.html', title: 'A · Action Queue — Desktop', x: 0, y: 0, w: 1440, h: 900 },
    {
      file: 'ActionQueuePhone.dc.html',
      title: 'A · Action Queue — Phone',
      x: 0,
      y: 1060,
      w: 390,
      h: 844,
    },
    {
      file: 'StationBoard.dc.html',
      title: 'B · Station Board — Desktop',
      x: 1560,
      y: 0,
      w: 1440,
      h: 900,
    },
    {
      file: 'StationBoardPhone.dc.html',
      title: 'B · Station Board — Phone',
      x: 1560,
      y: 1060,
      w: 390,
      h: 844,
    },
    {
      file: 'NextFortyEight.dc.html',
      title: 'C · Next 48 Hours — Desktop',
      x: 3120,
      y: 0,
      w: 1440,
      h: 900,
    },
    {
      file: 'NextFortyEightPhone.dc.html',
      title: 'C · Next 48 Hours — Phone',
      x: 3120,
      y: 1060,
      w: 390,
      h: 844,
    },
    { file: 'States.dc.html', title: 'Shared states', x: 0, y: 2100, w: 1440, h: 450 },
  ],
  annotations: [
    {
      id: 'brief',
      x: 0,
      y: -300,
      w: 520,
      text: 'Overview → a page that says what needs addressing.\n\nSame eleven attention items in all three, so the concepts differ on organising principle and nothing else. Every row names a destination; every signal below is one the codebase already computes.\n\nSources: colonyAttention (idle / expiring-soon / decayed) · OpenOrderRow.problem (belowFloor, outbid, expiringOrStale, undercut*) · isJobDone / isCompletingSoon · MiningTaxAssignmentStatus needs-review · selectQueueDepth · NotificationFeedRecord.',
    },
    {
      id: 'concept-a',
      x: 600,
      y: -300,
      w: 380,
      text: 'A · ACTION QUEUE\n\nOne merged list, severity then clock. The ordering IS the page; domain is a tag, not a container.\n\nFor: never hides a bad hour, one place to work top-down, filters when you want one domain.\n\nAgainst: no per-domain sense of "am I done with PI?", and eleven rows of different kinds can read as noise.',
    },
    {
      id: 'concept-b',
      x: 1560,
      y: -300,
      w: 380,
      text: "B · STATION BOARD\n\nOne panel per domain, each showing only its exceptions. Same anatomy as the Corp ops board's Kind Cards.\n\nFor: already proven in this app, each domain answerable on its own, the summary strip carries the merged view.\n\nAgainst: six calm cards can hide one bad Tuesday between them — the exact problem the Corp Deadline Strip was added to fix.",
    },
    {
      id: 'concept-c',
      x: 3120,
      y: -300,
      w: 380,
      text: 'C · NEXT 48 HOURS\n\nTime is the spine: a deadline strip, then buckets by when a thing lands, plus one honest panel for what has no clock.\n\nFor: best answer to "what do I do this evening"; the strip shows shape at a glance.\n\nAgainst: roughly half the work has no deadline (undercut orders, moon reviews, jobs already ready), so the "No clock" panel carries a lot.',
    },
    {
      id: 'open-q',
      x: 600,
      y: 1060,
      w: 380,
      text: 'OPEN QUESTIONS\n\n1. Multi-character. Everything on Overview is active-character-only, but the notification feed is device-wide. A prompted with an "other characters" strip; B and C say nothing. Should the board span all your characters?\n\n2. Deep links. "Orders" goes to /market?section=orders, not to the one undercut order — no route exists for that today. Same for a single colony. Worth adding?\n\n3. Does this replace Overview, or sit above it? The wallet/queue/tile panels are gone from all three.',
    },
  ],
  launch: { view: 'canvas' },
};

// --- Write -----------------------------------------------------------------

const files = {
  'Main.dc.html': conceptADesktop,
  'ActionQueuePhone.dc.html': conceptAPhone,
  'StationBoard.dc.html': conceptBDesktop,
  'StationBoardPhone.dc.html': conceptBPhone,
  'NextFortyEight.dc.html': conceptCDesktop,
  'NextFortyEightPhone.dc.html': conceptCPhone,
  'States.dc.html': states,
  'canvas.json': `${JSON.stringify(canvas, null, 2)}\n`,
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT, name), content, 'utf8');
}
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);

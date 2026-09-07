/**
 * Shared pieces for the Overview-triage mockup artboards.
 *
 * Every value here is lifted from the real app, not eyeballed:
 * colours from `src/styles/index.css`, control heights from
 * `src/components/ui/controlStyles.ts`, the panel/row/chip anatomy from
 * `Panel.tsx` / `StatChip.tsx` / `FilterChip.tsx` / `CorpBoardRow.tsx`, the
 * rail and bottom bar from `src/app/Layout.tsx`, and the icon geometry from
 * Phosphor's `light` weight (the pack + weight `src/components/ui/icons.tsx`
 * pins). Sizes are written in px because a `.dc.html` artboard has no Tailwind
 * root to scale from; each one is the resolved value of the class it replaces.
 */

export const C = {
  bg: '#0a0e14',
  panel: '#11161d',
  panel2: '#161d27',
  panelGlass: 'rgba(17,22,29,0.85)',
  line: '#2a3442',
  lineBright: '#3d4c5f',
  text: '#dee7ee',
  dim: '#95a3b4',
  faint: '#5c6b7a',
  accent: '#57c7f4',
  accentDim: '#2e7da3',
  accentContrast: '#04181f',
  success: '#5fd584',
  warning: '#f5b94a',
  danger: '#ff7369',
  iskPos: '#4fd98a',
};

export const FONT =
  "'Segoe UI', Roboto, 'Helvetica Neue', Arial, ui-sans-serif, system-ui, sans-serif";

/** Phosphor `light` (256 grid), copied from @phosphor-icons/react's own defs. */
const P = {
  // SeverityCritical — WarningOctagon
  critical:
    'M122,136V80a6,6,0,0,1,12,0v56a6,6,0,0,1-12,0ZM230,91.55v72.9a13.92,13.92,0,0,1-4.1,9.9L174.35,225.9a13.92,13.92,0,0,1-9.9,4.1H91.55a13.92,13.92,0,0,1-9.9-4.1L30.1,174.35a13.92,13.92,0,0,1-4.1-9.9V91.55a13.92,13.92,0,0,1,4.1-9.9L81.65,30.1a13.92,13.92,0,0,1,9.9-4.1h72.9a13.92,13.92,0,0,1,9.9,4.1L225.9,81.65A13.92,13.92,0,0,1,230,91.55Zm-12,0a2,2,0,0,0-.59-1.42L165.87,38.59a2,2,0,0,0-1.42-.59H91.55a2,2,0,0,0-1.41.59L38.58,90.13A2,2,0,0,0,38,91.55v72.9a2,2,0,0,0,.59,1.42l51.54,51.54a2,2,0,0,0,1.42.59h72.9a2,2,0,0,0,1.41-.59l51.56-51.54a2,2,0,0,0,.58-1.42ZM128,162a10,10,0,1,0,10,10A10,10,0,0,0,128,162Z',
  // Warn — Warning (the `warning` severity, per CorpBoardRow's SEVERITY_ICON)
  warn: 'M235.07,189.09,147.61,37.22h0a22.75,22.75,0,0,0-39.22,0L20.93,189.09a21.53,21.53,0,0,0,0,21.72A22.35,22.35,0,0,0,40.55,222h174.9a22.35,22.35,0,0,0,19.6-11.19A21.53,21.53,0,0,0,235.07,189.09ZM224.66,204.8a10.46,10.46,0,0,1-9.21,5.2H40.55a10.46,10.46,0,0,1-9.21-5.2,9.51,9.51,0,0,1,0-9.72L118.79,43.21a10.75,10.75,0,0,1,18.42,0l87.46,151.87A9.51,9.51,0,0,1,224.66,204.8ZM122,144V104a6,6,0,0,1,12,0v40a6,6,0,0,1-12,0Zm16,36a10,10,0,1,1-10-10A10,10,0,0,1,138,180Z',
  // SeverityWatch — Eye
  watch:
    'M245.48,125.57c-.34-.78-8.66-19.23-27.24-37.81C201,70.54,171.38,50,128,50S55,70.54,37.76,87.76c-18.58,18.58-26.9,37-27.24,37.81a6,6,0,0,0,0,4.88c.34.77,8.66,19.22,27.24,37.8C55,185.47,84.62,206,128,206s73-20.53,90.24-37.75c18.58-18.58,26.9-37,27.24-37.8A6,6,0,0,0,245.48,125.57ZM128,194c-31.38,0-58.78-11.42-81.45-33.93A134.77,134.77,0,0,1,22.69,128,134.56,134.56,0,0,1,46.55,95.94C69.22,73.42,96.62,62,128,62s58.78,11.42,81.45,33.94A134.56,134.56,0,0,1,233.31,128C226.94,140.21,195,194,128,194Zm0-112a46,46,0,1,0,46,46A46.06,46.06,0,0,0,128,82Zm0,80a34,34,0,1,1,34-34A34,34,0,0,1,128,162Z',
  // SeverityClear — CheckCircle
  clear:
    'M172.24,99.76a6,6,0,0,1,0,8.48l-56,56a6,6,0,0,1-8.48,0l-24-24a6,6,0,0,1,8.48-8.48L112,151.51l51.76-51.75A6,6,0,0,1,172.24,99.76ZM230,128A102,102,0,1,1,128,26,102.12,102.12,0,0,1,230,128Zm-12,0a90,90,0,1,0-90,90A90.1,90.1,0,0,0,218,128Z',
  // Skills — GraduationCap
  skills:
    'M250.82,90.71l-120-64a5.94,5.94,0,0,0-5.64,0l-120,64a6,6,0,0,0,0,10.58L34,116.67v49.62a14,14,0,0,0,3.55,9.32C50.42,189.94,79.29,214,128,214a127.21,127.21,0,0,0,50-9.73V240a6,6,0,0,0,12,0V198.35a113.18,113.18,0,0,0,28.45-22.75,13.91,13.91,0,0,0,3.55-9.31V116.67l28.82-15.38a6,6,0,0,0,0-10.58ZM128,202c-44,0-70-21.56-81.52-34.41a2,2,0,0,1-.48-1.3V123.07l79.18,42.22a6,6,0,0,0,5.64,0L178,140.13v51C165,197.35,148.45,202,128,202Zm82-35.71a2,2,0,0,1-.48,1.3A100.25,100.25,0,0,1,190,184.3V133.73l20-10.66Zm-22.15-45a6.27,6.27,0,0,0-1-.71l-56-29.86a6,6,0,0,0-5.64,10.58L175.25,128,128,153.2,20.75,96,128,38.8,235.25,96Z',
  // Industry — Factory
  industry:
    'M114,176a6,6,0,0,1-6,6H80a6,6,0,0,1,0-12h28A6,6,0,0,1,114,176Zm62-6H148a6,6,0,0,0,0,12h28a6,6,0,0,0,0-12Zm62,46a6,6,0,0,1-6,6H24a6,6,0,0,1,0-12H34V88a6,6,0,0,1,9.6-4.8L98,124V88a6,6,0,0,1,9.6-4.8L149,114.28l12-84.26a14.07,14.07,0,0,1,13.86-12h18.12a14.07,14.07,0,0,1,13.86,12l15,105.13s.06.59.06.85v74h10A6,6,0,0,1,238,216Zm-78-93.51L170,130h39.08L195,31.72a2,2,0,0,0-2-1.72H174.94a2,2,0,0,0-2,1.72ZM46,210H210V142H168a6,6,0,0,1-3.6-1.2L150,130l0,0L110,100v36a6,6,0,0,1-9.6,4.8L46,100Z',
  // Orders — Receipt
  orders:
    'M182,104a6,6,0,0,1-6,6H80a6,6,0,0,1,0-12h96A6,6,0,0,1,182,104Zm-6,26H80a6,6,0,0,0,0,12h96a6,6,0,0,0,0-12Zm54-74V208a6,6,0,0,1-2.85,5.1,5.93,5.93,0,0,1-3.15.9,6,6,0,0,1-2.68-.63L192,198.71l-29.32,14.66a6,6,0,0,1-5.36,0L128,198.71,98.68,213.37a6,6,0,0,1-5.36,0L64,198.71,34.68,213.37A6,6,0,0,1,26,208V56A14,14,0,0,1,40,42H216A14,14,0,0,1,230,56Zm-12,0a2,2,0,0,0-2-2H40a2,2,0,0,0-2,2V198.29l23.32-11.66a6,6,0,0,1,5.36,0L96,201.29l29.32-14.66a6,6,0,0,1,5.36,0L160,201.29l29.32-14.66a6,6,0,0,1,5.36,0L218,198.29Z',
  // Planetary — Planet
  planetary:
    'M243.39,61.68c-7.24-12.48-27-15-57.24-7.49A93.92,93.92,0,0,0,34.05,128a94.5,94.5,0,0,0,.9,13c-21.86,22.38-29.56,40.78-22.29,53.32,4.5,7.76,14,11.69,27.86,11.69a116.38,116.38,0,0,0,25-3.16c1.45-.32,2.92-.68,4.41-1a93.95,93.95,0,0,0,151.19-86.89c12.65-13,21.11-25.32,23.86-35.6C246.76,72.53,246.24,66.59,243.39,61.68ZM128,46a82.12,82.12,0,0,1,80.19,64.94c-16,15.3-38.14,31.67-63.3,46.12C117.49,172.82,92.79,183,72.85,188.6A82,82,0,0,1,128,46ZM23,188.3c-3.52-6.07,2.31-18.56,15-33a94,94,0,0,0,21.07,36.62C39.42,195.74,26.39,194.08,23,188.3ZM128,210a81.41,81.41,0,0,1-43.35-12.45c20.68-6.71,43.56-17.06,66.22-30.08,22.83-13.12,43.13-27.67,59.05-41.91,0,.81.06,1.62.06,2.44A82.08,82.08,0,0,1,128,210Z',
  // MoonMining — Moon
  moon: 'M232.13,143.64a6,6,0,0,0-6-1.49A90.07,90.07,0,0,1,113.86,29.85a6,6,0,0,0-7.49-7.48A102.88,102.88,0,0,0,54.48,58.68,102,102,0,0,0,197.32,201.52a102.88,102.88,0,0,0,36.31-51.89A6,6,0,0,0,232.13,143.64Zm-42,48.29a90,90,0,0,1-126-126A90.9,90.9,0,0,1,99.65,37.66,102.06,102.06,0,0,0,218.34,156.35,90.9,90.9,0,0,1,190.1,191.93Z',
  // Notifications — Bell
  bell: 'M220.07,176.94C214.41,167.2,206,139.73,206,104a78,78,0,1,0-156,0c0,35.74-8.42,63.2-14.08,72.94A14,14,0,0,0,48,198H90.48a38,38,0,0,0,75,0H208a14,14,0,0,0,12.06-21.06ZM128,218a26,26,0,0,1-25.29-20h50.58A26,26,0,0,1,128,218Zm81.71-33a1.9,1.9,0,0,1-1.7,1H48a1.9,1.9,0,0,1-1.7-1,2,2,0,0,1,0-2C53.87,170,62,139.69,62,104a66,66,0,1,1,132,0c0,35.68,8.14,65.95,15.71,79A2,2,0,0,1,209.71,185Z',
  // Refresh — ArrowClockwise
  refresh:
    'M238,56v48a6,6,0,0,1-6,6H184a6,6,0,0,1,0-12h32.55l-30.38-27.8c-.06-.06-.12-.13-.19-.19a82,82,0,1,0-1.7,117.65,6,6,0,0,1,8.24,8.73A93.46,93.46,0,0,1,128,222h-1.28A94,94,0,1,1,194.37,61.4L226,90.35V56a6,6,0,1,1,12,0Z',
  // Descend — CaretRight
  caret:
    'M180.24,132.24l-80,80a6,6,0,0,1-8.48-8.48L167.51,128,91.76,52.24a6,6,0,0,1,8.48-8.48l80,80A6,6,0,0,1,180.24,132.24Z',
  // Close — X
  close:
    'M202.24,195.76a6,6,0,1,1-8.48,8.48L128,138.49,62.24,204.24a6,6,0,0,1-8.48-8.48L119.51,130,53.76,64.24a6,6,0,0,1,8.48-8.48L128,121.51l65.76-65.75a6,6,0,0,1,8.48,8.48L136.49,130Z',
  // Contracts — FileText
  contracts:
    'M212.24,83.76l-56-56A6,6,0,0,0,152,26H56A14,14,0,0,0,42,40V216a14,14,0,0,0,14,14H200a14,14,0,0,0,14-14V88A6,6,0,0,0,212.24,83.76ZM158,46.48,193.52,82H158ZM200,218H56a2,2,0,0,1-2-2V40a2,2,0,0,1,2-2h90V88a6,6,0,0,0,6,6h50V216A2,2,0,0,1,200,218Zm-34-82a6,6,0,0,1-6,6H96a6,6,0,0,1,0-12h64A6,6,0,0,1,166,136Zm0,32a6,6,0,0,1-6,6H96a6,6,0,0,1,0-12h64A6,6,0,0,1,166,168Z',
  // Wallet
  wallet:
    'M216,66H56a10,10,0,0,1,0-20H192a6,6,0,0,0,0-12H56A22,22,0,0,0,34,56V184a22,22,0,0,0,22,22H216a14,14,0,0,0,14-14V80A14,14,0,0,0,216,66Zm2,126a2,2,0,0,1-2,2H56a10,10,0,0,1-10-10V75.59A21.84,21.84,0,0,0,56,78H216a2,2,0,0,1,2,2Zm-28-60a10,10,0,1,1-10-10A10,10,0,0,1,190,132Z',
};

/** An inline Phosphor glyph at `px`, in `currentColor`. */
export function icon(name, px = 16, extra = '') {
  return `<svg viewBox="0 0 256 256" width="${px}" height="${px}" fill="currentColor" aria-hidden="true" style="flex-shrink: 0; ${extra}"><path d="${P[name]}"></path></svg>`;
}

/** `LogoMark`, verbatim from src/components/ui/LogoMark.tsx. */
export function logoMark(px = 28) {
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true" width="${px}" height="${px}" style="flex-shrink: 0; color: ${C.accent}">
  <path d="M32 6 54.5 19 54.5 45 32 58 9.5 45 9.5 19Z" stroke="#cbd6e2" stroke-width="3" stroke-linejoin="round"></path>
  <path d="M32 11 39 25 48 32 39 39 32 53 25 39 16 32 25 25Z" fill="#e6edf4"></path>
  <path d="M32 28 36 32 32 36 28 32Z" fill="${C.bg}"></path>
  <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22.7 17.9 15.1 22.25 15.1 29"></path>
    <path d="M41.3 17.9 48.9 22.25 48.9 29"></path>
    <path d="M22.7 46.1 15.1 41.75 15.1 35"></path>
    <path d="M41.3 46.1 48.9 41.75 48.9 35"></path>
  </g>
</svg>`;
}

/** Severity → colour + glyph, exactly as `CorpBoardRow.tsx` maps them. */
export const SEV = {
  critical: { color: C.danger, glyph: 'critical', word: 'Critical' },
  warning: { color: C.warning, glyph: 'warn', word: 'Warning' },
  watch: { color: C.accent, glyph: 'watch', word: 'Watch' },
  clear: { color: C.dim, glyph: 'clear', word: 'Clear' },
};

const MICRO = `font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;`;

export const S = {
  micro: MICRO,
  microDim: `${MICRO} color: ${C.dim};`,
  panel: `border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panelGlass};`,
  /** Panel header: min-h-9 desktop / min-h-11 touch, panel-2 fill, py-1 px-3. */
  panelHead: (touch = false) =>
    `display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: ${touch ? 44 : 36}px; padding: 4px 12px; border-bottom: 1px solid ${C.line}; background: ${C.panel2};`,
  row: `display: flex; align-items: baseline; gap: 12px; padding: 10px 12px; border-bottom: 1px solid ${C.line};`,
  link: `color: ${C.accent};`,
};

/** `StatChip` — h-7, panel-2 fill, 11px label + tabular value. */
export function statChip(label, value, tone = C.text) {
  return `<span style="display: inline-flex; height: 28px; flex-shrink: 0; align-items: center; gap: 6px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panel2}; padding: 0 10px; font-size: 11px; white-space: nowrap;">
  <span style="${S.microDim}">${label}</span>
  <span style="font-weight: 500; font-variant-numeric: tabular-nums; color: ${tone};">${value}</span>
</span>`;
}

/** `FilterChip` — h-7 on desktop, h-9 on touch. */
export function filterChip(label, count, selected = false, touch = false) {
  const on = selected
    ? `border-color: ${C.accentDim}; background: rgba(87,199,244,0.15); color: ${C.accent};`
    : `border-color: ${C.line}; background: ${C.panel2}; color: ${C.dim};`;
  return `<span style="display: inline-flex; height: ${touch ? 36 : 28}px; align-items: center; gap: 6px; border: 1px solid; border-radius: 2px; padding: 0 10px; ${MICRO} white-space: nowrap; ${on}">${label}${
    count === undefined
      ? ''
      : `<span style="font-weight: 500; font-variant-numeric: tabular-nums;">${count}</span>`
  }</span>`;
}

/** `DataAgeBadge` — dot + relative age, toned by staleness. */
export function ageBadge(text, tone = C.dim) {
  return `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-variant-numeric: tabular-nums; color: ${tone};">
  <span style="width: 6px; height: 6px; border-radius: 999px; background: currentColor;"></span>${text}
</span>`;
}

/** `IconButton size="sm"` — the refresh control every ESI panel carries. */
export function refreshButton(touch = false) {
  const px = touch ? 36 : 28;
  return `<span style="display: inline-flex; width: ${px}px; height: ${px}px; align-items: center; justify-content: center; border: 1px solid ${C.line}; border-radius: 2px; color: ${C.dim};">${icon('refresh', 16)}</span>`;
}

export function panelHeader({ title, meta = '', actions = '', touch = false }) {
  return `<header style="${S.panelHead(touch)}">
  <div style="display: flex; min-width: 0; align-items: center; gap: 10px;">
    <h2 style="margin: 0; ${S.microDim} white-space: nowrap;">${title}</h2>
    ${meta}
  </div>
  ${actions ? `<div style="display: flex; align-items: center; gap: 4px;">${actions}</div>` : ''}
</header>`;
}

/**
 * One triage row. Mirrors `CorpBoardRow`: a `w-24` countdown carrying the
 * severity's colour AND glyph, the subject, the reason under it, and — new
 * here, because this board mixes domains where the corp board did not — the
 * destination the row navigates to.
 *
 * `compact` (a narrow column) and `touch` (a phone) both move the destination
 * onto the end of the reason line rather than into a column of its own. Drawn
 * as a right-hand column it cost ~90px of a 200px subject, which truncated
 * every row; the destination has to survive, because "clicking it takes me to
 * the right page" is the whole point of the board. `noDest` is for a row
 * inside a card whose own header already names where it goes.
 */
export function triageRow({
  sev,
  when,
  subject,
  detail,
  dest,
  short,
  touch = false,
  compact = false,
  noDest = false,
  last = false,
}) {
  const s = SEV[sev];
  const narrow = touch || compact;
  const head = narrow && short ? short.subject : subject;
  const sub = narrow && short ? short.detail : detail;
  const width = touch ? 'width: 100%;' : compact ? 'width: 76px;' : 'width: 96px;';
  const countdown = `<span style="display: flex; ${width} flex-shrink: 0; align-items: center; gap: 4px; overflow: hidden; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; color: ${s.color};">${icon(s.glyph, 16)}${when}</span>`;
  const inlineDest = narrow && !noDest ? ` <span style="color: ${C.accent};">· ${dest}</span>` : '';
  const trailing = noDest
    ? `<span style="display: inline-flex; flex-shrink: 0; color: ${C.accent};">${icon('caret', 12)}</span>`
    : narrow
      ? `<span style="display: inline-flex; flex-shrink: 0; color: ${C.accent};">${icon('caret', 12)}</span>`
      : `<span style="display: inline-flex; flex-shrink: 0; align-items: center; gap: 4px; ${S.microDim} color: ${C.accent};">${dest}${icon('caret', 12)}</span>`;
  return `<li style="${S.row}${last ? ' border-bottom: 0;' : ''}${touch ? ' flex-wrap: wrap; row-gap: 4px;' : ''}">
  ${countdown}
  <div style="min-width: 0; flex: 1;">
    <p style="margin: 0; font-size: 14px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${head}</p>
    <p style="margin: 0; font-size: 12px; line-height: 16px; color: ${C.dim}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sub}${inlineDest}</p>
  </div>
  ${trailing}
</li>`;
}

/**
 * A count, not a row. The answer to "I have 21 orders being undercut": one
 * number you can act on, sized to be read across the room, that opens the page
 * already filtered. Twenty-one rows of the same fact is not twenty-one facts.
 *
 * Severity tones the number (with its glyph beside it, never colour alone);
 * the label stays `text-dim` so a row of tiles reads as one control strip.
 */
export function numberTile({ label, value, sev = 'clear', big = false }) {
  const s = SEV[sev];
  return `<span style="display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; border: 1px solid ${C.line}; border-radius: 2px; background: ${C.panel2}; padding: 8px 10px;">
  <span style="display: flex; align-items: center; gap: 5px; color: ${s.color};">
    ${icon(s.glyph, big ? 18 : 16)}
    <span style="font-size: ${big ? 24 : 20}px; line-height: ${big ? 28 : 24}px; font-weight: 600; font-variant-numeric: tabular-nums;">${value}</span>
  </span>
  <span style="${S.microDim} overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${label}</span>
</span>`;
}

/** A row of `numberTile`s inside a card's padded body. */
export function tileRow(tiles) {
  return `<div style="display: flex; gap: 8px; padding: 12px;">${tiles.join('')}</div>`;
}

/**
 * One cell of the summary strip. `hero` is the 30px tier DESIGN.md §2 reserves
 * for hero numbers — used once, on the next deadline, which is the single thing
 * the page is asked most often.
 */
export function stripCell({ label, value, tone = C.text, note = '', hero = false, grow = 1 }) {
  return `<span style="display: flex; min-width: 0; flex: ${grow}; flex-direction: column; gap: 2px;">
  <span style="${S.microDim}">${label}</span>
  <span style="font-size: ${hero ? 30 : 16}px; line-height: ${hero ? 34 : 22}px; font-weight: ${hero ? 600 : 500}; font-variant-numeric: tabular-nums; color: ${tone}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${value}</span>
  ${note ? `<span style="font-size: 12px; line-height: 16px; color: ${C.dim}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${note}</span>` : ''}
</span>`;
}

/**
 * A board card. The footer is pinned to the bottom (`margin-top: auto` inside a
 * stretched flex column) so cards in a grid row share a bottom edge — the same
 * call `routes/Overview.tsx` already makes in prose: "a pair of cards at
 * different heights reads as one of them having failed to load".
 */
export function card({ title, meta = '', open = '', body, footer = '', touch = false }) {
  return `<section style="${S.panel} display: flex; min-width: 0; flex-direction: column;">
  ${panelHeader({
    title,
    meta,
    actions: open
      ? `<span style="display: inline-flex; align-items: center; gap: 4px; ${MICRO} color: ${C.accent};">${open}${icon('caret', 12)}</span>`
      : '',
    touch,
  })}
  ${body}
  ${
    footer
      ? `<div style="margin-top: auto; border-top: 1px solid ${C.line}; padding: 8px 12px; ${S.microDim} font-variant-numeric: tabular-nums;">${footer}</div>`
      : ''
  }
</section>`;
}

/** The desktop left rail (`Layout.tsx`), at its real 192px width. */
export function rail(height) {
  const item = (label, active = false, locked = false) =>
    `<div style="display: flex; align-items: center; gap: 8px; border: 1px solid ${active ? C.lineBright : 'transparent'}; border-radius: 2px; padding: 8px 12px; ${MICRO} background: ${active ? C.panel2 : 'transparent'}; color: ${active ? C.accent : C.dim};">
  <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis;">${label}</span>
  ${locked ? `<span style="margin-left: auto; width: 6px; height: 6px; flex-shrink: 0; border-radius: 999px; background: ${C.warning};"></span>` : ''}
</div>`;
  const group = (label) =>
    `<p style="margin: 12px 0 0; padding: 0 12px; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.dim};">${label}</p>`;
  return `<aside style="position: sticky; top: 0; display: flex; height: ${height}px; width: 192px; flex-shrink: 0; flex-direction: column; border-right: 1px solid ${C.line}; background: ${C.panelGlass};">
  <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid ${C.line}; padding: 12px;">
    ${logoMark(28)}
    <span style="flex: 1; ${MICRO} font-size: 12px;">Neocom Desk</span>
  </div>
  <nav style="display: flex; flex: 1; flex-direction: column; gap: 4px; overflow: hidden; padding: 8px;">
    ${item('Overview', true)}
    ${item('Corp')}
    ${group('Progression')}
    ${item('Skills')}
    ${item('Industry')}
    ${item('Mining Tax')}
    ${item('Planetary')}
    ${group('Economy')}
    ${item('Market')}
    ${item('Wallet')}
    ${item('Assets')}
    ${item('Contracts', false, true)}
  </nav>
  <div style="flex-shrink: 0; border-bottom: 1px solid ${C.line}; padding: 8px;">${item('Settings')}</div>
  <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px;">
    ${avatar(28)}
    <span style="${MICRO} font-size: 11px; color: ${C.dim};">Kaelen Vor</span>
  </div>
</aside>`;
}

/** The mobile bottom tab bar (`Layout.tsx`) — 4 destinations plus More. */
export function bottomBar() {
  const tab = (label, active = false) =>
    `<span style="display: flex; min-height: 44px; min-width: 0; flex: 1; align-items: center; justify-content: center; border-top: 2px solid ${active ? C.accent : 'transparent'}; background: ${active ? C.panel2 : 'transparent'}; padding: 8px 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: ${active ? C.accent : C.dim};">${label}</span>`;
  return `<nav style="position: absolute; inset: auto 0 0 0; display: flex; align-items: stretch; border-top: 1px solid ${C.line}; background: rgba(17,22,29,0.95);">
  ${tab('Overview', true)}${tab('Skills')}${tab('Industry')}${tab('PI')}${tab('More')}
</nav>`;
}

/** Portrait stand-in: the real box (`characterAvatarBox`), a drawn face is not the point. */
export function avatar(px = 64, initials = 'KV') {
  return `<span style="display: inline-flex; width: ${px}px; height: ${px}px; flex-shrink: 0; align-items: center; justify-content: center; border: 1px solid ${C.line}; border-radius: 2px; background: linear-gradient(150deg, #1d2836, #11161d); color: ${C.faint}; font-size: ${Math.round(px / 2.6)}px; font-weight: 600;">${initials}</span>`;
}

/** `CharacterHeader` — avatar, name, corp/alliance, the two SP chips. */
export function characterHeader() {
  return `<header style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
  ${avatar(64)}
  <div style="min-width: 0; flex: 1 1 192px;">
    <h1 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Kaelen Vor</h1>
    <p style="margin: 0; font-size: 12px; color: ${C.dim}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Sidereal Logistics / Northern Freight Union</p>
  </div>
  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
    ${statChip('Total SP', '84,206,113')}
    ${statChip('Unallocated', '412,000')}
  </div>
</header>`;
}

/** `OverviewSubNav` — real routes, real tab styling. */
export function subNav(touch = false) {
  const tab = (label, active = false, locked = false) =>
    `<span style="display: inline-flex; height: ${touch ? 44 : 36}px; margin-bottom: -1px; flex-shrink: 0; align-items: center; gap: 6px; border-bottom: 2px solid ${active ? C.accent : 'transparent'}; background: ${active ? 'rgba(22,29,39,0.6)' : 'transparent'}; padding: 0 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${active ? C.text : C.dim};">${label}${locked ? `<span style="width: 6px; height: 6px; border-radius: 999px; background: ${C.warning};"></span>` : ''}</span>`;
  return `<div style="display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid ${C.line};">
  ${tab('Overview', true)}${tab('Clones', false, true)}${tab('Employment History')}
</div>`;
}

/** The `.dc.html` wrapper. Static artboards carry no logic script. */
export function artboard({ width, height, body, extraCss = '' }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }
    * { box-sizing: border-box; }
    p, h1, h2, h3, ul, li { margin: 0; }
    ul { list-style: none; padding: 0; }
    a { color: ${C.accent}; }
    a:hover { color: #8adcff; }
    ${extraCss}
  </style>
</helmet>
<div style="position: relative; display: flex; width: ${width}px; height: ${height}px; overflow: hidden; background: ${C.bg}; color: ${C.text}; font-size: 14px;">
${body}
</div>
</x-dc>
</body>
</html>
`;
}

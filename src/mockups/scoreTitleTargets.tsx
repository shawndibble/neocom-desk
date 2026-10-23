import type { ReactNode } from 'react';
import { formatCount } from '@/lib/formatCount';
import { CONTACT_PILOTS, OWN_PILOTS, type SampleTitle } from './characterScoreTitleFixtures';
import type { InjectTarget } from './ScoreTitleInject';

/** Issue #4777: where each proposed piece goes in the real pages, and what it says. */

const PROPOSED = 'outline-1 -outline-offset-1 outline-dashed outline-warning';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  return () => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };
}

const points = (score: number) => `${formatCount(score)} points`;

/** The one-line form, "Title · 1,240 points"; null when there is neither. */
function scoreTitleLine(title: SampleTitle | undefined, score: number): ReactNode {
  if (!title && score === 0) return null;
  if (!title) return points(score);
  if (score === 0) return title.name;
  return (
    <>
      <b className="font-medium text-text">{title.name}</b>
      <span aria-hidden> · </span>
      {points(score)}
    </>
  );
}

/**
 * The table cell: title over points. `stacks` is a table whose phone rows fold
 * into one meta line (Contacts, Corp / Alliance's shape); the Characters table
 * scrolls sideways on a phone instead, so its cell stays two lines.
 */
function scoreTitleCell(title: SampleTitle | undefined, score: number, stacks: boolean): ReactNode {
  if (!title && score === 0) return <span data-dense-omit="true">—</span>;
  return (
    <span
      className={
        stacks ? 'inline min-w-0 sm:flex sm:flex-col sm:items-start' : 'flex flex-col items-start'
      }
    >
      {title && <span className="truncate">{title.name}</span>}
      {title && stacks && (
        <span aria-hidden className="sm:hidden">
          {' · '}
        </span>
      )}
      <span className="text-text-dim tabular-nums">{score > 0 ? points(score) : null}</span>
    </span>
  );
}

const HEADER = 'Title / Score';

function headerTarget(after: Element | undefined, key: string): InjectTarget[] {
  if (!after) return [];
  return [
    {
      key,
      anchor: after,
      shell: element('th', `p-0 ${PROPOSED}`),
      content: (
        <span className="flex items-center">
          <span className="inline-flex items-center gap-1 px-3 py-2 font-semibold uppercase">
            {HEADER}
          </span>
        </span>
      ),
    },
  ];
}

function headerCell(label: string): Element | undefined {
  return [...document.querySelectorAll('#storybook-root table thead th')].find(
    (th) => th.textContent?.trim().startsWith(label) && !th.hasAttribute('data-mock-injected')
  );
}

/** The column picker's new entry, unchecked (off by default), under the existing ones. */
function pickerEntryTarget(key: string): InjectTarget[] {
  const items = document.querySelectorAll('[role="menu"] [role="menuitemcheckbox"]');
  const last = [...items].filter((item) => !item.hasAttribute('data-mock-injected')).at(-1);
  if (!last) return [];
  return [
    {
      key,
      anchor: last,
      shell: () => {
        const node = last.cloneNode(true) as HTMLElement;
        node.setAttribute('aria-checked', 'false');
        node.dataset.state = 'unchecked';
        node.classList.add(...PROPOSED.split(' '));
        // Unchecked: the check glyph's box stays, empty; the label is the item's own text.
        const check = node.querySelector('[aria-hidden="true"]');
        if (check) check.textContent = '';
        node.lastChild!.textContent = HEADER;
        return node;
      },
      content: null,
    },
  ];
}

/** Contacts: the new optional column after Corp / Alliance, and its picker entry. */
export function findContactsColumn(): InjectTarget[] {
  const targets = headerTarget(headerCell('Corp / Alliance'), 'contacts-header');
  document.querySelectorAll('#storybook-root table tbody tr[data-row-key]').forEach((row) => {
    const anchor = row.querySelector('td[data-label="Corp / Alliance"]');
    if (!anchor) return;
    const id = Number(row.getAttribute('data-row-key'));
    const pilot = CONTACT_PILOTS.find((p) => p.id === id);
    targets.push({
      key: `contacts-${id}`,
      anchor,
      shell: element('td', `${anchor.className.replace('dt-meta-first', '')} ${PROPOSED}`),
      content: scoreTitleCell(pilot?.title, pilot?.score ?? 0, true),
    });
  });
  return targets;
}

export function findContactsPicker(): InjectTarget[] {
  return pickerEntryTarget('contacts-picker');
}

/** Characters table: the new optional column after Name. */
export function findCharactersColumn(): InjectTarget[] {
  const targets = headerTarget(headerCell('Name'), 'characters-header');
  document.querySelectorAll('#storybook-root table tbody tr[data-row-key]').forEach((row) => {
    const anchor = row.querySelector('td[data-label="Name"]');
    if (!anchor) return;
    const id = Number(row.getAttribute('data-row-key'));
    const pilot = OWN_PILOTS[id];
    targets.push({
      key: `characters-${id}`,
      anchor,
      shell: element('td', `${anchor.className.replace(/dt-\S+/g, '')} dt-meta ${PROPOSED}`),
      content: scoreTitleCell(pilot?.title, pilot?.score ?? 0, false),
    });
  });
  return targets;
}

export function findCharactersPicker(): InjectTarget[] {
  return pickerEntryTarget('characters-picker');
}

/** Characters cards: a line under the corporation and alliance lines. */
export function findCardLines(): InjectTarget[] {
  const targets: InjectTarget[] = [];
  document.querySelectorAll('#storybook-root [data-character-select]').forEach((button) => {
    const id = Number(button.getAttribute('data-character-select'));
    const pilot = OWN_PILOTS[id];
    const line = pilot && scoreTitleLine(pilot.title, pilot.score);
    const identity = button.parentElement?.parentElement;
    if (!line || !identity) return;
    targets.push({
      key: `card-${id}`,
      anchor: identity,
      where: 'append',
      shell: element('span', `block w-fit max-w-full truncate text-xs text-text-dim ${PROPOSED}`),
      content: line,
    });
  });
  return targets;
}

/** Overview: a line under the Character header's corporation. */
export function findHeaderLine(): InjectTarget[] {
  const corp = document.querySelector('#storybook-root header h1')?.parentElement
    ?.nextElementSibling;
  const pilot = Object.values(OWN_PILOTS)[0];
  if (!corp || !pilot) return [];
  return [
    {
      key: 'header',
      anchor: corp,
      shell: element('p', `w-fit max-w-full truncate text-xs text-text-dim ${PROPOSED}`),
      content: scoreTitleLine(pilot.title, pilot.score),
    },
  ];
}

/** Show info's Character tab: a line under the corporation · alliance line. */
export function findModalLine(pilot: { title?: SampleTitle; score: number }) {
  return (): InjectTarget[] => {
    const corp = document.querySelector('dialog div.min-w-0.space-y-0\\.5 > p');
    const line = scoreTitleLine(pilot.title, pilot.score);
    if (!corp || !line) return [];
    return [
      {
        key: 'modal',
        anchor: corp,
        shell: element('p', `text-xs text-text-dim ${PROPOSED}`),
        content: line,
      },
    ];
  };
}

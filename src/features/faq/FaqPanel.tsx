import { useId, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { Caret } from '@/components/ui/Disclosure';
import { tabPath } from '@/lib/pageTabs';
import { HELP_TABS, SETTINGS_TABS } from '@/app/pageTabs';
import { WHAT_WE_STORE_GROUPS, type WhatWeStoreGroup } from './whatWeStore';

const LINK = inlineLinkClassName;
const LIST = 'list-disc space-y-1 pl-5 marker:text-text-faint';

/** One store group's description and lines, as a question's answer. */
function StoreGroup({ group }: { group: WhatWeStoreGroup }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-text-dim">{t(group.descriptionKey)}</p>
      <ul className={LIST}>
        {group.items.map((item) => (
          <li key={item.id}>
            {t(item.labelKey)}
            {item.noteKey !== undefined && (
              <span className="text-text-dim"> {t(item.noteKey)}</span>
            )}
            {item.detailKeys !== undefined && (
              <ul className="mt-1 list-[circle] space-y-1 pl-5 text-text-dim marker:text-text-faint">
                {item.detailKeys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * One question, a body-size row that opens its answer below. Not `Disclosure`,
 * whose label is a micro-heading: a question is read as a sentence.
 */
function FaqItem({
  question,
  expanded,
  onToggle,
  children,
}: {
  question: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const answerId = useId();
  return (
    <li className="rounded-xs border border-line bg-panel/85">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? answerId : undefined}
        onClick={onToggle}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-text',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <Caret expanded={expanded} />
        {question}
      </button>
      {expanded && (
        <div id={answerId} className="space-y-2 border-t border-line px-3 py-3 text-sm">
          {children}
        </div>
      )}
    </li>
  );
}

interface FaqEntry {
  readonly id: string;
  readonly questionKey: string;
  readonly answer: ReactNode;
}

function storeGroup(id: string): WhatWeStoreGroup {
  const group = WHAT_WE_STORE_GROUPS.find((candidate) => candidate.id === id);
  if (!group) throw new Error(`No store group "${id}"`);
  return group;
}

/**
 * Help › FAQ: one collapsible card per question, all closed, so the page reads
 * as a list of questions to scan and open, not a wall of answers.
 *
 * The store groups (`whatWeStore.ts`) are a user-facing commitment, written
 * from what actually reaches a server; the answers here present them, they do
 * not restate them. No status colours: "synced" versus "stays on this device"
 * is said in words (DESIGN.md §6, §7).
 */
export function FaqPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const entries: readonly FaqEntry[] = [
    {
      id: 'synced',
      questionKey: 'settings.faq.q.synced',
      answer: <StoreGroup group={storeGroup('synced')} />,
    },
    {
      id: 'local',
      questionKey: 'settings.faq.q.local',
      answer: <StoreGroup group={storeGroup('local')} />,
    },
    {
      id: 'writes',
      questionKey: 'settings.faq.q.writes',
      answer: <p>{t('settings.faq.store.notes.writes')}</p>,
    },
    {
      id: 'delete',
      questionKey: 'settings.faq.q.delete',
      answer: (
        <>
          <p>{t('settings.faq.a.delete')}</p>
          <p className="text-text-dim">{t('settings.faq.store.notes.removal')}</p>
        </>
      ),
    },
    {
      id: 'install',
      questionKey: 'settings.faq.q.install',
      answer: (
        <p>
          <Trans
            i18nKey="settings.faq.a.install"
            components={{
              link: <Link to={tabPath(SETTINGS_TABS, 'dataAge')} className={LINK} />,
            }}
          />
        </p>
      ),
    },
    {
      id: 'update',
      questionKey: 'settings.faq.q.update',
      answer: <p>{t('settings.faq.a.update')}</p>,
    },
    {
      id: 'push',
      questionKey: 'settings.faq.q.push',
      answer: (
        <>
          <p>{t('settings.faq.a.pushKinds')}</p>
          <p className="text-text-dim">{t('settings.faq.store.notes.push')}</p>
        </>
      ),
    },
    {
      id: 'crashes',
      questionKey: 'settings.faq.q.crashes',
      answer: <p>{t('settings.faq.store.notes.crashes')}</p>,
    },
    {
      id: 'backups',
      questionKey: 'settings.faq.q.backups',
      answer: <p>{t('settings.faq.store.notes.export')}</p>,
    },
  ];

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-dim">{t('settings.faq.storeIntro')}</p>
      <ul className="space-y-2" aria-label={t('settings.help.tabFaq')}>
        {entries.map((entry) => (
          <FaqItem
            key={entry.id}
            question={t(entry.questionKey)}
            expanded={open.has(entry.id)}
            onToggle={() => toggle(entry.id)}
          >
            {entry.answer}
          </FaqItem>
        ))}
      </ul>
      <p className="text-sm text-text-dim">
        <Trans
          i18nKey="settings.faq.store.privacyLink"
          components={{
            privacy: <a href="/privacy.html" className={LINK} />,
          }}
        />{' '}
        <Trans
          i18nKey="settings.faq.helpPointer"
          components={{
            help: <Link to={tabPath(HELP_TABS, 'support')} className={LINK} />,
          }}
        />
      </p>
    </div>
  );
}

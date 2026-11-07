import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink } from '@/components/ui/ExternalLink';
import {
  AUTHORIZED_APPS_URL,
  CCP_SUPPORT_URL,
  EVE_UNI_LEXICON_URL,
  EVE_UNI_MAKING_MONEY_URL,
  EVE_UNI_NEW_PLAYER_URL,
} from '@/lib/links';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { QuestionRow } from '@/components/ui/QuestionRow';
import { tabPath } from '@/lib/pageTabs';
import {
  CONTRACTS_TABS,
  HELP_TABS,
  MARKET_TABS,
  MINING_TABS,
  SETTINGS_TABS,
  TRAVEL_TABS,
  WALLET_TABS,
} from '@/app/pageTabs';
import { SHIPS_TABS } from '@/features/fittings/shipsTabs';
import { ROUTE_PREFERENCE_SHORT_LABEL_KEYS } from '@/features/route/routePreferences';
import {
  RETENTION_GROUPS,
  WHAT_WE_STORE_GROUPS,
  type RetentionGroup,
  type WhatWeStoreGroup,
} from './whatWeStore';

const LINK = inlineLinkClassName;
const TRAIN_SKILLS_PATHS = [
  'settings.faq.a.trainSkillsQueue',
  'settings.faq.a.trainSkillsCertified',
  'settings.faq.a.trainSkillsShip',
  'settings.faq.a.trainSkillsFit',
  'settings.faq.a.trainSkillsSearch',
  'settings.faq.a.trainSkillsPaste',
] as const;
const LIST = 'list-disc space-y-1 pl-5 marker:text-text-faint';
const NEW_TO_EVE = 'settings.faq.a.newToEve';
/** The EVE words "What do these EVE words mean?" defines, in the order a new pilot meets them. */
const EVE_TERMS = [
  'sp',
  'isk',
  'clones',
  'lp',
  'security',
  'jumpClone',
  'implants',
  'blueprints',
  'meTe',
  'tradeHub',
  'collateral',
  'dscan',
  'local',
] as const;
const MAKE_ISK_WAYS = [
  'makeIskMissions',
  'makeIskMining',
  'makeIskLoot',
  'makeIskCourier',
] as const;
const SECURITY_SPACES = [
  'securityHighsec',
  'securityLowsec',
  'securityNullsec',
  'securityWormhole',
] as const;

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

/** One retention group: what is kept, with how long beside it. */
function RetentionList({ group }: { group: RetentionGroup }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-1">
      <h3 className="font-semibold text-text">{t(group.titleKey)}</h3>
      <ul className={LIST}>
        {group.items.map((item) => (
          <li key={item.id}>
            {t(item.labelKey)} <span className="text-text-dim">{t(item.durationKey)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface FaqEntry {
  readonly id: string;
  readonly questionKey: string;
  readonly answer: ReactNode;
}

/** The question id a URL hash names (`#data-lag`), or an empty string. */
function anchorOf(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return '';
  }
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
  const { hash } = useLocation();

  // "New to EVE?" teaches the game, not the app: each answer points to the page
  // that helps, and out to EVE University and CCP for the rest. Facts only, so
  // the security answer gives no verdicts (the travel copy rule).
  const newToEve: readonly FaqEntry[] = [
    {
      id: 'eve-terms',
      questionKey: 'settings.faq.q.eveTerms',
      answer: (
        <>
          <p>
            <Trans
              i18nKey={`${NEW_TO_EVE}.termsIntro`}
              components={{ glossary: <ExternalLink href={EVE_UNI_LEXICON_URL} /> }}
            />
          </p>
          <dl className="space-y-2">
            {EVE_TERMS.map((term) => (
              <div key={term}>
                <dt className="font-semibold text-text">{t(`${NEW_TO_EVE}.terms.${term}.term`)}</dt>
                <dd className="text-text-dim">{t(`${NEW_TO_EVE}.terms.${term}.definition`)}</dd>
              </div>
            ))}
          </dl>
        </>
      ),
    },
    {
      id: 'make-isk',
      questionKey: 'settings.faq.q.makeIsk',
      answer: (
        <>
          <p>{t(`${NEW_TO_EVE}.makeIskIntro`)}</p>
          <ul className={LIST}>
            {MAKE_ISK_WAYS.map((key) => (
              <li key={key}>
                <Trans
                  i18nKey={`${NEW_TO_EVE}.${key}`}
                  components={{
                    lp: <Link to={tabPath(WALLET_TABS, 'lp-store')} className={LINK} />,
                    mining: <Link to={tabPath(MINING_TABS, 'overview')} className={LINK} />,
                    appraisal: <Link to={tabPath(MARKET_TABS, 'appraisal')} className={LINK} />,
                    courier: (
                      <Link to={tabPath(CONTRACTS_TABS, 'search/courier')} className={LINK} />
                    ),
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'first-ship',
      questionKey: 'settings.faq.q.firstShip',
      answer: (
        <>
          <p>
            <Trans
              i18nKey={`${NEW_TO_EVE}.firstShip`}
              components={{ tree: <Link to={tabPath(SHIPS_TABS, 'tree')} className={LINK} /> }}
            />
          </p>
          <p>
            <Trans
              i18nKey={`${NEW_TO_EVE}.firstShipPlan`}
              components={{ plans: <Link to="/skills/plans" className={LINK} /> }}
            />
          </p>
        </>
      ),
    },
    {
      id: 'security-space',
      questionKey: 'settings.faq.q.securitySpace',
      answer: (
        <>
          <ul className={LIST}>
            {SECURITY_SPACES.map((key) => (
              <li key={key}>{t(`${NEW_TO_EVE}.${key}`)}</li>
            ))}
          </ul>
          <p>
            <Trans
              i18nKey={`${NEW_TO_EVE}.securityRoute`}
              // Route rules' own label, so the answer can't drift from it.
              values={{ preference: t(ROUTE_PREFERENCE_SHORT_LABEL_KEYS['prefer-highsec']) }}
              components={{ route: <Link to={tabPath(TRAVEL_TABS, 'route')} className={LINK} /> }}
            />
          </p>
        </>
      ),
    },
    {
      id: 'learn-more',
      questionKey: 'settings.faq.q.learnMore',
      answer: (
        <p>
          <Trans
            i18nKey={`${NEW_TO_EVE}.learnMore`}
            components={{
              uni: <ExternalLink href={EVE_UNI_NEW_PLAYER_URL} />,
              money: <ExternalLink href={EVE_UNI_MAKING_MONEY_URL} />,
              ccp: <ExternalLink href={CCP_SUPPORT_URL} />,
            }}
          />
        </p>
      ),
    },
  ];

  const using: readonly FaqEntry[] = [
    {
      id: 'permissions',
      questionKey: 'settings.faq.q.permissions',
      answer: (
        <p>
          <Trans
            i18nKey="settings.faq.a.permissions"
            components={{
              custom: <span className="font-semibold text-text" />,
              ccp: <ExternalLink href={AUTHORIZED_APPS_URL} />,
            }}
          />
        </p>
      ),
    },
    {
      id: 'data-lag',
      questionKey: 'settings.faq.q.dataLag',
      answer: (
        <p>
          <Trans
            i18nKey="settings.faq.a.dataLag"
            components={{
              data: <Link to={tabPath(SETTINGS_TABS, 'dataAge')} className={LINK} />,
            }}
          />
        </p>
      ),
    },
    {
      id: 'alerts',
      questionKey: 'settings.faq.q.alerts',
      answer: <p>{t('settings.faq.a.alerts')}</p>,
    },
    {
      id: 'characters',
      questionKey: 'settings.faq.q.characters',
      answer: <p>{t('settings.faq.a.characters')}</p>,
    },
    {
      id: 'row-menus',
      questionKey: 'settings.faq.q.rowMenus',
      answer: <p>{t('settings.faq.a.rowMenus')}</p>,
    },
    {
      id: 'phone',
      questionKey: 'settings.faq.q.phone',
      answer: <p>{t('settings.faq.a.phone')}</p>,
    },
    {
      id: 'install',
      questionKey: 'settings.faq.q.install',
      answer: (
        <p>
          <Trans
            i18nKey="settings.faq.a.install"
            components={{
              link: <Link to={tabPath(SETTINGS_TABS, 'app')} className={LINK} />,
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
      id: 'train-skills',
      questionKey: 'settings.faq.q.trainSkills',
      answer: (
        <>
          <p>{t('settings.faq.a.trainSkills')}</p>
          <ul className={LIST}>
            {TRAIN_SKILLS_PATHS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: 'communities',
      questionKey: 'settings.faq.q.communities',
      answer: <p>{t('settings.faq.a.communities')}</p>,
    },
  ];

  const data: readonly FaqEntry[] = [
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
      id: 'community-data',
      questionKey: 'settings.faq.q.communityData',
      answer: <StoreGroup group={storeGroup('communities')} />,
    },
    {
      id: 'corp-records',
      questionKey: 'settings.faq.q.corpRecords',
      answer: <StoreGroup group={storeGroup('corpRecords')} />,
    },
    {
      id: 'share-links',
      questionKey: 'settings.faq.q.shareLinks',
      answer: <p>{t('settings.faq.store.notes.shareLinks')}</p>,
    },
    {
      id: 'retention',
      questionKey: 'settings.faq.q.retention',
      answer: (
        <>
          {RETENTION_GROUPS.map((group) => (
            <RetentionList key={group.id} group={group} />
          ))}
        </>
      ),
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

  // A link to `/help/faq#<id>` (the landing page's, a toast's) opens that
  // question and scrolls to it. Other questions keep whatever state they have.
  // The open set follows the hash while rendering (not in an effect), so the
  // linked question is already open on the first paint.
  const linked = [...newToEve, ...using, ...data].some((entry) => entry.id === anchorOf(hash))
    ? anchorOf(hash)
    : null;
  const [seenLink, setSeenLink] = useState<string | null>(null);
  if (linked !== seenLink) {
    setSeenLink(linked);
    if (linked !== null && !open.has(linked)) setOpen(new Set(open).add(linked));
  }
  useEffect(() => {
    if (linked !== null) document.getElementById(linked)?.scrollIntoView?.({ block: 'start' });
  }, [linked]);

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const sections = [
    { id: 'newToEve', titleKey: 'settings.faq.groups.newToEve', entries: newToEve },
    { id: 'using', titleKey: 'settings.faq.groups.using', entries: using },
    { id: 'data', titleKey: 'settings.faq.groups.data', entries: data },
  ] as const;

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.id} className="space-y-2" aria-labelledby={`faq-group-${section.id}`}>
          <h2 id={`faq-group-${section.id}`} className="text-sm font-semibold text-text">
            {t(section.titleKey)}
          </h2>
          {section.id === 'data' && (
            <p className="text-sm text-text-dim">{t('settings.faq.storeIntro')}</p>
          )}
          <ul className="space-y-2" aria-labelledby={`faq-group-${section.id}`}>
            {section.entries.map((entry) => (
              <QuestionRow
                key={entry.id}
                id={entry.id}
                question={t(entry.questionKey)}
                expanded={open.has(entry.id)}
                onToggle={() => toggle(entry.id)}
                className="scroll-mt-4 rounded-xs border border-line bg-panel/85"
              >
                {entry.answer}
              </QuestionRow>
            ))}
          </ul>
        </section>
      ))}
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

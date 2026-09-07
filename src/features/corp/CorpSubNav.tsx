import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabListFlushClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { useCorpAccess } from './useCorpAccess';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return cx(tabItemClassName, isActive ? tabItemActiveClassName : tabItemIdleClassName);
}

/**
 * The Corp section's frame, not the Overview page's chrome.
 *
 * It carries three entries today and is built for more. Real navigation (routes) rather than a `Tabs` widget,
 * matching `SkillsSubNav` and `OverviewSubNav` — it sits in the same slot and
 * reads as the same control, so it borrows their classes rather than
 * approximating them.
 *
 * No lock markers, unlike `OverviewSubNav`. Corp views hide rather than lock
 * (CONTEXT.md round 35), and this whole nav renders only for a Character whose
 * Corp Access is `ready` — so there is no locked state left for an entry here
 * to mark.
 *
 * **Per-entry Corp Capability, not one gate for the section.** `ready` is the
 * gate on the section; it is not a promise about any particular view inside it.
 * `membertracking` answers to `Director` alone, so an Accountant who is `ready`
 * for the wallet rail would follow a Members tab straight into an empty state
 * about a permission no login can grant. The entry is simply absent for them —
 * the same hide rule, applied one level down.
 *
 * Two independent wrappers, and they answer different questions.
 * `tabScrollerClassName` makes the bar scroll sideways rather than squeeze its
 * entries (#562) — that is about width. `flush` drops the bar's *own* baseline
 * for a caller that already draws one, which is `PageHeader`'s `subNav` slot
 * (#566) — that is about which element owns the hairline.
 */
export function CorpSubNav({ flush = false }: { flush?: boolean } = {}) {
  const { t } = useTranslation();
  const { capabilities } = useCorpAccess();
  return (
    <div className={tabScrollerClassName}>
      <nav aria-label={t('nav.corp')} className={flush ? tabListFlushClassName : tabListClassName}>
        <NavLink to="/corp" end className={subNavClass}>
          {t('corp.overviewTab')}
        </NavLink>
        {capabilities.canReadMembers && (
          <NavLink to="/corp/members" end className={subNavClass}>
            {t('corp.membersTab')}
          </NavLink>
        )}
        {capabilities.canReadAssets && (
          <NavLink to="/corp/assets" end className={subNavClass}>
            {t('corp.assetsTab')}
          </NavLink>
        )}
      </nav>
    </div>
  );
}

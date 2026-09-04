/**
 * The People half of the board's side rail (issue #345).
 *
 * `CorpVitalsRail` answers "can the corporation still pay for this"; this
 * answers "is anyone paying attention". The Directorate design study had both
 * on the overview from the start — only Money shipped (#296), and the People
 * panel fell out through ticket scoping rather than a decision (CONTEXT.md
 * round 45).
 *
 * **A summary that links, not a second roster.** It answers "should I go
 * look"; `/corp/members` answers "at what". Nothing here resolves a name — the
 * four figures need no `/universe/names` call at all, which is what keeps a
 * second consumer of the roster read cheap.
 *
 * **Every figure comes from the same engine call `/corp/members` makes**
 * (`memberStanding` for dark, `diffRoster` upstream for the change), so the
 * summary and the page it links to cannot drift. A second dark threshold or a
 * locally-counted "inactive" would be exactly that drift.
 *
 * Rendered only when the Character holds `canReadMembers` (`Corp.tsx`) — a
 * Station Manager who is not a Director simply has no People rail: no error,
 * no empty state, nothing (CONTEXT.md round 35).
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Panel, StatChip, buttonClassName } from '@/components/ui';
import {
  DARK_AFTER_DAYS,
  memberStanding,
  type MemberActivity,
  type RosterDiff,
} from '@/engine/corp/members';

interface CorpPeopleRailProps {
  /** Tracking rows, already adapted — `features/corp/members.ts`. */
  members: readonly MemberActivity[];
  /**
   * Who joined and left since this device last *opened the roster*.
   *
   * The overview reads that baseline and deliberately does not replace it
   * (`Corp.tsx`), so this figure stands until the user follows the link — the
   * "should I go look" is still true right up until they do.
   */
  diff: RosterDiff;
  /** Captured by the loader — `Date.now()` in render is impure and React forbids it. */
  nowMs: number;
}

export function CorpPeopleRail({ members, diff, nowMs }: CorpPeopleRailProps) {
  const { t } = useTranslation();

  // `memberStanding` and its threshold, not a count of our own: this figure has
  // to equal the one `CorpRosterStats` prints for the same roster.
  const dark = members.filter((member) => memberStanding(member, nowMs).isDark).length;

  return (
    <Panel
      title={t('corp.peopleTitle')}
      actions={
        // A Link styled as a control rather than a `Button`, matching
        // `NotificationFeedPanel`: it navigates, so it stays an anchor.
        <Link to="/corp/members" className={buttonClassName({ size: 'sm' })}>
          {t('corp.people.viewRoster')}
        </Link>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {/*
          The same two strings the roster page's own stat strip uses, not
          copies of them — a label that drifts is as confusing as a figure
          that does.
        */}
        <StatChip label={t('corp.members.total')} value={members.length} />
        <StatChip
          label={t('corp.members.dark', { days: DARK_AFTER_DAYS })}
          value={dark}
          tone={dark > 0 ? 'warning' : 'default'}
          tooltip={t('corp.members.darkHint', { days: DARK_AFTER_DAYS })}
        />
        {/*
          Shown at zero, unlike `CorpRosterSummary`, which hides an unchanged
          roster entirely. The two are different objects: that is a sentence
          announcing a change, and an empty one would be announcing nothing,
          while this is a rail of standing figures and "0 joined" is the answer
          to the question the rail is always asking. A chip that came and went
          would also reflow the rail on every visit.
        */}
        <StatChip
          label={t('corp.people.joined')}
          value={diff.joined.length}
          tone={diff.joined.length > 0 ? 'success' : 'default'}
          tooltip={t('corp.people.changeHint')}
        />
        <StatChip
          label={t('corp.people.left')}
          value={diff.left.length}
          tone={diff.left.length > 0 ? 'warning' : 'default'}
          tooltip={t('corp.people.changeHint')}
        />
      </div>
    </Panel>
  );
}

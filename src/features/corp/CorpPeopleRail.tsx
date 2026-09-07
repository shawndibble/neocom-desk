/**
 * The People half of the board's summary (issue #345).
 *
 * Was the lower half of an 18rem side rail; since #566 it is a half-width panel
 * along the bottom of the overview, beside Money. The file keeps its name — the
 * rename is not worth the churn — but the geometry it describes is the panel,
 * not a rail.
 *
 * `CorpVitalsRail` answers "can the corporation still pay for this"; this
 * answers "is anyone paying attention". The Directorate design study had both
 * on the overview from the start — only Money shipped (#296), and the People
 * panel fell out through ticket scoping rather than a decision (CONTEXT.md
 * round 45).
 *
 * **A summary that links, not a second roster.** It answers "should I go
 * look"; `/corp/members` answers "at what".
 *
 * It does now name a handful of people (#566). The four figures alone left the
 * panel prompting a question it could not answer — "dark 30d+: 3" and nowhere
 * to look — and the panel has the width for three lines since the 18rem rail
 * became a half-width bottom panel. The names are still not resolved here: the
 * loader passes them in, capped at `PEOPLE_HIGHLIGHT_LIMIT` per list, so an
 * alliance-holding corp's roster never becomes a chunked `/universe/names`
 * batch to print three rows.
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
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Panel, StatChip, buttonClassName } from '@/components/ui';
import {
  label,
  memberStanding,
  type MemberActivity,
  type PeopleHighlights,
  type RosterDiff,
} from '@/engine/corp/members';
import { useDarkThreshold } from './darkThreshold';

interface CorpPeopleRailProps {
  /** Tracking rows, already adapted — `features/corp/members.ts`. */
  members: readonly MemberActivity[];
  /** The few members this panel names, chosen by `peopleHighlights` (#566). */
  highlights: PeopleHighlights;
  /** Names for exactly those ids. An id with no name prints as `#id`. */
  names: ReadonlyMap<number, string>;
  /**
   * Who joined and left since this device last *opened the roster*, or `null`
   * when the member-id list could not be read at all.
   *
   * The overview reads that baseline and deliberately does not replace it
   * (`Corp.tsx`), so this figure stands until the user follows the link — the
   * "should I go look" is still true right up until they do.
   */
  diff: RosterDiff | null;
  /** Captured by the loader — `Date.now()` in render is impure and React forbids it. */
  nowMs: number;
}

export function CorpPeopleRail({ members, highlights, names, diff, nowMs }: CorpPeopleRailProps) {
  const { t } = useTranslation();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const hydrateDarkThreshold = useDarkThreshold((state) => state.hydrate);
  useEffect(() => {
    void hydrateDarkThreshold();
  }, [hydrateDarkThreshold]);

  // `memberStanding` and its threshold, not a count of our own: this figure has
  // to equal the one `CorpRosterStats` prints for the same roster — which is
  // why both read the same preference instead of one of them keeping 30.
  const darkMembers = members.filter(
    (member) => memberStanding(member, nowMs, darkAfterDays).isDark
  );
  const dark = darkMembers.length;
  const rosterChanged = highlights.joined.length > 0 || highlights.left.length > 0;

  // The loader resolved names for the longest-absent members at the *loosest*
  // threshold it could (`Corp.tsx`), so this list is re-filtered here against
  // the live preference rather than re-fetched. Safe because `peopleHighlights`
  // sorts by absence, which no threshold reorders: anyone it dropped is absent
  // for less time than everyone it kept, so a stricter threshold can only trim
  // the tail of this list — never admit a name the loader has no word for.
  const darkNamed = highlights.dark.filter(
    (member) => memberStanding(member, nowMs, darkAfterDays).isDark
  );

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
          label={t('corp.members.dark', { days: darkAfterDays })}
          value={dark}
          tone={dark > 0 ? 'warning' : 'default'}
          tooltip={t('corp.members.darkHint', { days: darkAfterDays })}
        />
        {/*
          Shown at zero, unlike `CorpRosterSummary`, which hides an unchanged
          roster entirely. The two are different objects: that is a sentence
          announcing a change, and an empty one would be announcing nothing,
          while this is a rail of standing figures and "0 joined" is the answer
          to the question the rail is always asking. A chip that came and went
          would also reflow the rail on every visit.

          A `null` diff is the one case that does drop them, and for the
          opposite reason: the id list could not be read, so "0 joined" would
          not be a standing figure but a claim. `/corp/members` shows no
          summary there either.
        */}
        {diff !== null && (
          <>
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
          </>
        )}
      </div>

      {/*
        Two lists, each present only when it has something to say. A heading
        over an empty column would be the panel stating a non-fact to fill the
        width it just gained.
      */}
      {(darkNamed.length > 0 || rosterChanged) && (
        <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {darkNamed.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('corp.people.darkList', { days: darkAfterDays })}
              </h3>
              {darkNamed.map((member) => {
                const standing = memberStanding(member, nowMs, darkAfterDays);
                return (
                  <p
                    key={member.characterId}
                    className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-xs last:border-b-0"
                  >
                    <span className="min-w-0 truncate">
                      {label(names.get(member.characterId) ?? null, member.characterId)}
                    </span>
                    <span className="shrink-0 text-text-dim tabular-nums">
                      {standing.neverSeen
                        ? t('corp.members.never')
                        : t('corp.people.darkForDays', {
                            count: Math.floor((standing.darkForMs ?? 0) / 86_400_000),
                          })}
                    </span>
                  </p>
                );
              })}
            </div>
          )}
          {rosterChanged && (
            <div>
              <h3 className="mb-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('corp.people.changeList')}
              </h3>
              {highlights.joined.map((characterId) => (
                <p
                  key={`joined-${characterId}`}
                  className="border-b border-line py-1.5 text-xs text-success last:border-b-0"
                >
                  <span className="truncate">
                    {t('corp.people.joinedName', {
                      name: label(names.get(characterId) ?? null, characterId),
                    })}
                  </span>
                </p>
              ))}
              {highlights.left.map((characterId) => (
                <p
                  key={`left-${characterId}`}
                  className="border-b border-line py-1.5 text-xs text-warning last:border-b-0"
                >
                  <span className="truncate">
                    {t('corp.people.leftName', {
                      name: label(names.get(characterId) ?? null, characterId),
                    })}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

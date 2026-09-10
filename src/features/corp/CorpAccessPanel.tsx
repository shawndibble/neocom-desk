/**
 * The permanent Corp access row in Settings (issue #295).
 *
 * Corp UI hides rather than locks, so for an ungranted Character *nothing else
 * in the app renders* — no nav item, no tab, no lock (CONTEXT.md round 35).
 * That makes this row the only durable way in for anyone who dismissed the
 * one-time prompt, and the only place the two-axis gate is ever explained: an
 * in-game role, which only CCP can change, and a grant, which is one press
 * here.
 *
 * Scoped to the active Character, like `useCorpAccess` itself. Roles are per
 * Character and only knowable by asking ESI for each one, so a row per stored
 * Character would mean a read per stored Character on every visit to Settings.
 */
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess, type CorpAccessState } from './useCorpAccess';
import { corpRoleLabel } from './roles';

/** One line of explanation per state — all five, including the ones with no action. */
const HINT_KEYS = {
  unknown: 'corp.accessUnknownHint',
  'not-granted': 'corp.accessMissingHint',
  none: 'corp.accessNoneHint',
  'roles-without-grant': 'corp.accessMissingHint',
  ready: 'corp.accessReadyHint',
} as const satisfies Record<CorpAccessState, string>;

/**
 * A distinct answer per state, so all five are told apart on sight (AC 4).
 *
 * `none` gets its own rather than borrowing "Not granted": there is nothing
 * for it to be missing, and "Not granted" beside a row with no Grant button
 * would read as a fault the user could fix. `not-granted` shares copy with
 * `roles-without-grant` on purpose — both mean "press Grant to move past
 * this" — and is told apart by the Roles cell instead.
 */
const GRANT_KEYS = {
  unknown: 'corp.accessGrantChecking',
  'not-granted': 'corp.accessGrantMissing',
  none: 'corp.accessGrantNotApplicable',
  'roles-without-grant': 'corp.accessGrantMissing',
  ready: 'corp.accessGrantGranted',
} as const satisfies Record<CorpAccessState, string>;

export function CorpAccessPanel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { state, roles } = useCorpAccess();

  return (
    <Panel title={t('corp.accessTitle')}>
      <div className="max-w-md space-y-2">
        <p className="text-xs text-text-dim">{t('corp.accessHint')}</p>
        {activeCharacterId === null ? (
          <p className="text-xs text-text-dim">{t('corp.accessCharacterUnknown')}</p>
        ) : (
          <>
            <dl className="divide-y divide-line text-xs">
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="text-text-dim">{t('corp.accessRolesLabel')}</dt>
                {/*
                  `unknown` has no answer yet, and "None" would be one — the
                  wrong one, for the Director whose roles read is still in
                  flight. `not-granted` has no answer either, for a different
                  reason: the read that would tell us has not been asked for.
                */}
                <dd className="text-right">
                  {state === 'unknown'
                    ? t('corp.accessGrantChecking')
                    : state === 'not-granted'
                      ? t('corp.accessRolesUnknown')
                      : roles.length === 0
                        ? t('corp.accessRolesNone')
                        : roles.map(corpRoleLabel).join(', ')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <dt className="text-text-dim">{t('corp.accessGrantLabel')}</dt>
                <dd className={state === 'ready' ? 'text-success' : undefined}>
                  {t(GRANT_KEYS[state])}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-text-dim">{t(HINT_KEYS[state])}</p>
            {/*
              `roles-without-grant` and `not-granted` both get a button —
              granting is the only way either one moves. `none` deliberately
              does not (AC 4): granting would widen the consent screen and
              unlock nothing, because CCP gates these endpoints on roles
              server-side. `unknown` has no button because it has no answer
              yet, and `ready` has nothing left to ask for.
            */}
            {(state === 'roles-without-grant' || state === 'not-granted') && (
              // `ghost`, not `primary`: /settings already spends its one
              // primary on the notifications panel's Enable
              // (docs/DESIGN.md §6, "One `primary` button per view").
              <Button
                size="sm"
                onClick={() =>
                  void beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] })
                }
              >
                {t('corp.accessGrantButton')}
              </Button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

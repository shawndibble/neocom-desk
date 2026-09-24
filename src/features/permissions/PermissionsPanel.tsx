/**
 * The per-Character Permissions section in Settings (#1524): every Permission
 * with its label, caption and granted/missing state, and a Grant button on each
 * missing one — `beginEveLogin` asks for the stored grant plus the Core Grant
 * plus that Permission (#1520). There is no Remove — revocation stays on CCP's own site
 * (docs/context/decisions/20260924-143410-customize-permissions-at-sign-in-core-grant-plus.md).
 *
 * Replaces the old Corp access row, whose two-axis gate lives on in the
 * Corporation row: hidden for a Character with no Corp Role (`none`), because
 * granting would unlock nothing for them, and grantable for
 * `roles-without-grant` and `not-granted`. The latter keeps its button because
 * the roles scope is itself in the `corp` group — until it is granted, whether
 * this Character holds a role is unknowable, and this row is the only way in
 * (docs/context/decisions/20260910-123303-move-read-corporation-roles-into-the-corp-scope.md).
 *
 * Scoped to the active Character, like `useCorpAccess` itself: roles are only
 * knowable by asking ESI per Character, so a section per stored Character
 * would mean a read per stored Character on every visit to Settings.
 */
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { PERMISSIONS, SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess, type CorpAccessState } from '@/features/corp/useCorpAccess';
import { corpRoleLabel } from '@/features/corp/roles';

/**
 * `checking` while the answer is still loading — never `missing`, which would
 * flash a Grant button on every row of every cold load.
 */
type RowStatus = 'checking' | 'granted' | 'missing';

/** `none` never reaches this: the Corporation row is not rendered for it. */
const CORP_STATUS = {
  unknown: 'checking',
  'not-granted': 'missing',
  none: 'checking',
  'roles-without-grant': 'missing',
  ready: 'granted',
} as const satisfies Record<CorpAccessState, RowStatus>;

export function PermissionsPanel() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const corp = useCorpAccess();

  function statusOf(group: ScopeGroup): RowStatus {
    if (group === 'corp') return CORP_STATUS[corp.state];
    if (granted === undefined) return 'checking';
    return isPermissionGranted(group, granted) ? 'granted' : 'missing';
  }

  /** The role half of the Corporation row's gate, which only CCP can change. */
  function corpNote(): string | null {
    if (corp.state === 'not-granted') return t('settings.permissions.corpRolesUnknown');
    if (corp.roles.length === 0) return null;
    return t('settings.permissions.corpRoles', {
      roles: corp.roles.map(corpRoleLabel).join(', '),
    });
  }

  const groups = SCOPE_GROUPS.filter((group) => group !== 'corp' || corp.state !== 'none');

  return (
    <Panel title={t('settings.permissions.title')}>
      <div className="max-w-xl space-y-2">
        <p className="text-xs text-text-dim">{t('settings.permissions.hint')}</p>
        {activeCharacterId === null ? (
          <p className="text-xs text-text-dim">{t('settings.permissions.selectCharacter')}</p>
        ) : (
          <ul className="divide-y divide-line text-xs">
            {groups.map((group) => {
              const label = t(PERMISSIONS[group].labelKey);
              const status = statusOf(group);
              const note = group === 'corp' ? corpNote() : null;
              return (
                <li key={group} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="text-text">{label}</div>
                    <div className="text-text-dim">{t(PERMISSIONS[group].captionKey)}</div>
                    {note && <div className="text-text-dim">{note}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status === 'granted' ? (
                      <span className="text-success">{t('settings.permissions.granted')}</span>
                    ) : status === 'checking' ? (
                      <span className="text-text-dim">{t('settings.permissions.checking')}</span>
                    ) : (
                      <>
                        <span className="text-text-dim">{t('settings.permissions.missing')}</span>
                        {/*
                          `ghost`, not `primary`: /settings already spends its
                          one primary on the notifications panel's Enable
                          (docs/DESIGN.md §6, "One `primary` button per view").
                        */}
                        <Button
                          size="sm"
                          aria-label={t('settings.permissions.grantAria', { permission: label })}
                          onClick={() =>
                            void beginEveLogin({ characterId: activeCharacterId, groups: [group] })
                          }
                        >
                          {t('settings.permissions.grant')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

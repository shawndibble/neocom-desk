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
import { useState } from 'react';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Checkbox, Panel } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { beginEveLogin } from '@/app/loginFlow';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { PERMISSIONS, SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';
import { AUTHORIZED_APPS_URL } from '@/lib/links';
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
  // Tagged with its Character so a switch drops the ticks instead of carrying them over.
  const [selection, setSelection] = useState<{
    characterId: number | null;
    groups: ReadonlySet<ScopeGroup>;
  }>({ characterId: null, groups: new Set() });
  const picked: ReadonlySet<ScopeGroup> =
    selection.characterId === activeCharacterId ? selection.groups : new Set();

  function setPicked(next: ReadonlySet<ScopeGroup>) {
    setSelection({ characterId: activeCharacterId, groups: next });
  }

  function grant(groups: ScopeGroup[]) {
    void beginEveLogin({ characterId: activeCharacterId ?? undefined, groups });
  }

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
  const missing = groups.filter((group) => statusOf(group) === 'missing');
  // Derived from `missing`, so a row that gets granted (or hidden) drops out of the request.
  const chosen = missing.filter((group) => picked.has(group));

  function toggle(group: ScopeGroup) {
    setSelection((prev) => {
      const next = new Set(prev.characterId === activeCharacterId ? prev.groups : []);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { characterId: activeCharacterId, groups: next };
    });
  }

  return (
    <Panel title={t('settings.permissions.title')}>
      <div className="space-y-2">
        <p className="max-w-2xl text-xs text-text-dim">
          <Trans
            i18nKey="settings.permissions.hint"
            components={{
              ccp: <ExternalLink href={AUTHORIZED_APPS_URL} />,
            }}
          />
        </p>
        {activeCharacterId === null ? (
          <p className="max-w-2xl text-xs text-text-dim">
            {t('settings.permissions.selectCharacter')}
          </p>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setPicked(new Set(missing))}>
                  {t('settings.permissions.selectAll')}
                </Button>
                <Button
                  size="sm"
                  disabled={chosen.length === 0}
                  onClick={() => setPicked(new Set())}
                >
                  {t('settings.permissions.selectNone')}
                </Button>
                {chosen.length > 0 && (
                  <Button size="sm" onClick={() => grant(chosen)}>
                    {t('settings.permissions.grantSelected', { count: chosen.length })}
                  </Button>
                )}
              </div>
            )}
            {/* Two columns from `xl`: one full-width list put each status a screen away from its name. */}
            <ul className="grid text-xs xl:grid-cols-2 xl:gap-x-8">
              {groups.map((group) => {
                const label = t(PERMISSIONS[group].labelKey);
                const status = statusOf(group);
                const note = group === 'corp' ? corpNote() : null;
                return (
                  <li
                    key={group}
                    className="flex items-center justify-between gap-4 border-t border-line py-2"
                  >
                    {status === 'missing' ? (
                      <label className={touchCheckboxLabelClassName}>
                        <Checkbox
                          checked={picked.has(group)}
                          onChange={() => toggle(group)}
                          aria-label={t('settings.permissions.selectAria', { permission: label })}
                        />
                      </label>
                    ) : (
                      // Keeps labels aligned with the rows that have a checkbox.
                      missing.length > 0 && (
                        <span aria-hidden className="size-4 shrink-0 touch:size-11" />
                      )
                    )}
                    <div className="min-w-0 flex-1">
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
                            onClick={() => grant([group])}
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
          </>
        )}
      </div>
    </Panel>
  );
}

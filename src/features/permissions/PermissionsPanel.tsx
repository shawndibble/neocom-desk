import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Checkbox, Disclosure, InfoTooltip, NeedsConnection, Panel } from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { plainTextActionClassName } from '@/components/ui/plainTextActionClassName';
import { beginEveLogin } from '@/app/loginFlow';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { PERMISSIONS, SCOPE_GROUPS, WRITE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { isPermissionGranted } from '@/esi/scopes';
import { AUTHORIZED_APPS_URL } from '@/lib/links';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpAccess, type CorpAccessState } from '@/features/corp/useCorpAccess';
import { useActiveNpcCorporation } from '@/features/corp/useActiveNpcCorporation';
import { corpRoleLabel } from '@/features/corp/roles';
import { SettingsHint } from '@/features/settings/settingsFields';
import { usePhoneFold } from '@/features/settings/usePhoneFold';
import { usePermissionMarkDismissals } from './permissionMarkDismissals';

type RowStatus = 'checking' | 'granted' | 'missing';

const CORP_STATUS = {
  unknown: 'checking',
  'not-granted': 'missing',
  none: 'checking',
  'roles-without-grant': 'missing',
  ready: 'granted',
} as const satisfies Record<CorpAccessState, RowStatus>;

const UNLOCKS_TOOLTIP: Partial<Record<ScopeGroup, string>> = {
  corp: 'settings.permissions.unlocks.corp',
  corpProjects: 'settings.permissions.unlocks.corpProjects',
  killmails: 'settings.permissions.unlocks.killmails',
  mercenaryDens: 'settings.permissions.unlocks.mercenaryDens',
  militaryCampaigns: 'settings.permissions.unlocks.militaryCampaigns',
};

function useFlaggedGroups(): ReadonlySet<ScopeGroup> {
  const [params] = useSearchParams();
  const raw = params.get('grant');
  if (!raw) return new Set();
  const wanted = raw.split(',');
  return new Set(SCOPE_GROUPS.filter((group) => wanted.includes(group)));
}

function scrollIntoViewOnce(node: HTMLElement | null) {
  node?.scrollIntoView?.({
    block: 'center',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

export function PermissionsPanel() {
  const { t } = useTranslation();
  const flagged = useFlaggedGroups();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const corp = useCorpAccess();
  const inNpcCorporation = useActiveNpcCorporation() != null;
  const grantedFold = usePhoneFold();
  const marks = usePermissionMarkDismissals();
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

  function corpNote(): string | null {
    if (corp.state === 'not-granted') return t('settings.permissions.corpRolesUnknown');
    if (corp.roles.length === 0) return null;
    return t('settings.permissions.corpRoles', {
      roles: corp.roles.map(corpRoleLabel).join(', '),
    });
  }

  const hideCorp = inNpcCorporation || corp.state === 'none';
  const groups = SCOPE_GROUPS.filter(
    (group) => !(group === 'corp' && hideCorp) && !(group === 'corpProjects' && inNpcCorporation)
  );
  const missing = groups.filter((group) => statusOf(group) === 'missing');
  const rows = [...missing, ...groups.filter((group) => statusOf(group) !== 'missing')];
  const foldedRows = grantedFold.phone ? rows.filter((group) => statusOf(group) === 'granted') : [];
  const shownRows = rows.filter((group) => !foldedRows.includes(group));
  const firstFlagged = rows.find((group) => flagged.has(group) && missing.includes(group));
  const chosen = missing.filter((group) => picked.has(group));

  function toggle(group: ScopeGroup) {
    setSelection((prev) => {
      const next = new Set(prev.characterId === activeCharacterId ? prev.groups : []);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { characterId: activeCharacterId, groups: next };
    });
  }

  function renderRow(group: ScopeGroup) {
    const label = t(PERMISSIONS[group].labelKey);
    const status = statusOf(group);
    const note = group === 'corp' ? corpNote() : null;
    return (
      <li key={group} className="flex items-center justify-between gap-4 border-t border-line py-2">
        {status === 'missing' ? (
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              checked={picked.has(group)}
              onChange={() => toggle(group)}
              aria-label={t('settings.permissions.selectAria', { permission: label })}
            />
          </label>
        ) : (
          missing.length > 0 && <span aria-hidden className="size-4 shrink-0 touch:size-9" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-text">
            {label}
            {UNLOCKS_TOOLTIP[group] && (
              <InfoTooltip
                label={t('common.aboutLabel', { label })}
                glyph="info"
                content={t(UNLOCKS_TOOLTIP[group])}
              />
            )}
          </div>
          <div className="text-text-dim">{t(PERMISSIONS[group].captionKey)}</div>
          {note && <div className="text-text-dim">{note}</div>}
          {marks.dismissed.includes(group) && (
            <div className="text-text-dim">
              {t('settings.permissions.notAsked')}{' '}
              <button
                type="button"
                className={plainTextActionClassName()}
                aria-label={t('settings.permissions.askAgainAria', { permission: label })}
                onClick={() => void marks.askAgain(group)}
              >
                {t('settings.permissions.askAgain')}
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === 'granted' ? (
            <span className="text-text-dim">{t('settings.permissions.granted')}</span>
          ) : status === 'checking' ? (
            <span className="text-text-dim">{t('settings.permissions.checking')}</span>
          ) : (
            <>
              <span className="text-text-dim">{t('settings.permissions.missing')}</span>
              <NeedsConnection>
                <Button
                  size="sm"
                  ref={group === firstFlagged ? scrollIntoViewOnce : undefined}
                  className={flagged.has(group) ? 'grant-flash' : undefined}
                  aria-label={t('settings.permissions.grantAria', {
                    permission: label,
                  })}
                  onClick={() => grant([group])}
                >
                  {t('settings.permissions.grant')}
                </Button>
              </NeedsConnection>
            </>
          )}
        </div>
      </li>
    );
  }

  function renderRows(list: ScopeGroup[], headed = true) {
    const writes = list.filter((group) => WRITE_GROUPS.includes(group));
    const reads = list.filter((group) => !WRITE_GROUPS.includes(group));
    return (
      <>
        {reads.length > 0 && (
          <ul className="grid text-xs xl:grid-cols-2 xl:gap-x-8">{reads.map(renderRow)}</ul>
        )}
        {writes.length > 0 &&
          (headed ? (
            <section aria-label={t('permissions.writeSection')} className="space-y-1 pt-2">
              <h3 className="text-sm font-semibold text-text">{t('permissions.writeSection')}</h3>
              <p className="text-xs text-text-dim">{t('permissions.writeSectionHint')}</p>
              <ul className="grid text-xs xl:grid-cols-2 xl:gap-x-8">{writes.map(renderRow)}</ul>
            </section>
          ) : (
            <ul className="grid text-xs xl:grid-cols-2 xl:gap-x-8">{writes.map(renderRow)}</ul>
          ))}
      </>
    );
  }

  return (
    <Panel>
      <div className="space-y-2">
        <SettingsHint>
          <Trans
            i18nKey="settings.permissions.hint"
            components={{
              ccp: <ExternalLink href={AUTHORIZED_APPS_URL} />,
            }}
          />
        </SettingsHint>
        {activeCharacterId === null ? (
          <SettingsHint>{t('settings.permissions.selectCharacter')}</SettingsHint>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setPicked(new Set(missing))}>
                  {t('settings.permissions.selectAll')}
                </Button>
                <Button
                  size="sm"
                  aria-disabled={chosen.length === 0}
                  onClick={() => setPicked(new Set())}
                >
                  {t('settings.permissions.selectNone')}
                </Button>
                {chosen.length > 0 && (
                  <NeedsConnection>
                    <Button
                      size="sm"
                      variant="primary"
                      className="grant-selected-in"
                      onClick={() => grant(chosen)}
                    >
                      {t('settings.permissions.grantSelected', { count: chosen.length })}
                    </Button>
                  </NeedsConnection>
                )}
              </div>
            )}
            {renderRows(shownRows)}
            {foldedRows.length > 0 && (
              <Disclosure
                label={t('settings.permissions.grantedGroup', { count: foldedRows.length })}
                expanded={grantedFold.expanded}
                onToggle={grantedFold.toggle}
              >
                {renderRows(foldedRows, false)}
              </Disclosure>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

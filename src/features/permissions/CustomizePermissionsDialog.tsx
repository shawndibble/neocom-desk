/**
 * "Customize permissions" (issue #1522): the Add Character login, but with a
 * hand-picked set of Permissions instead of the whole Base Grant. Opened from
 * the login page's "Customize permissions" link, directly under the plain
 * "Log in" button, which is unchanged and still asks for everything.
 *
 * The Core Grant sits at the top, checked and locked — hand-written as its two
 * user-facing rows (skills & skill queue, structure lookup) rather than
 * `CORE_GRANT`'s four raw scope names, which this dialog never shows
 * (docs/context/decisions/20260924-143410-customize-permissions-at-sign-in-core-grant-plus.md).
 * Below it, all 13 Permissions in a two-column checklist that collapses to one
 * at phone width, Corporation and Structure markets tagged "opt-in" and
 * unchecked by default.
 *
 * The selection persists device-locally only on submit — Cancel discards a
 * half-made change rather than remembering it (`customizeSelection.ts`).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import { beginCustomizedAddCharacterLogin } from '@/app/loginFlow';
import { PERMISSIONS, SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { useCustomizePermissionsSelection } from './customizeSelection';

interface CustomizePermissionsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The Core Grant's two user-facing rows — see the module doc for why these are hand-written rather than derived from `CORE_GRANT`. */
const CORE_ROWS = ['skills', 'structures'] as const;

export function CustomizePermissionsDialog({ open, onClose }: CustomizePermissionsDialogProps) {
  const { t } = useTranslation();
  const stored = useCustomizePermissionsSelection((state) => state.value);
  const hydrate = useCustomizePermissionsSelection((state) => state.hydrate);
  const persist = useCustomizePermissionsSelection((state) => state.setValue);

  // `null` means "no edit this open" — the draft follows the stored choice,
  // including once `hydrate()` below lands, the same reasoning
  // `MobileTabsPanel` (Settings.tsx) uses for its own store-backed draft. A
  // reset-on-open effect would need to call `setState` from inside itself,
  // which this avoids entirely: `handleClose` (Escape, backdrop, Cancel, and
  // a successful submit) clears it back to null, so the *next* open computes
  // `selected` fresh from whatever is stored then.
  const [pending, setPending] = useState<ReadonlySet<ScopeGroup> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = pending ?? new Set(stored);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  function toggle(group: ScopeGroup) {
    const next = new Set(selected);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setPending(next);
  }

  function handleClose() {
    setPending(null);
    onClose();
  }

  async function submit() {
    setSubmitting(true);
    try {
      const groups = [...selected];
      await persist(groups);
      await beginCustomizedAddCharacterLogin(groups);
      setPending(null);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('permissions.customize.title')}
      placement="wide"
    >
      <div className="space-y-4 text-sm">
        <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {CORE_ROWS.map((key) => (
            <li key={key} className="flex items-start gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked
                disabled
                aria-label={t(`permissions.core.${key}.label`)}
                aria-describedby={`core-${key}-caption`}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <div className="min-w-0">
                <div className="font-semibold">{t(`permissions.core.${key}.label`)}</div>
                <div id={`core-${key}-caption`} className="text-xs text-text-dim">
                  {t(`permissions.core.${key}.caption`)}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPending(new Set(SCOPE_GROUPS))}>
              {t('permissions.customize.selectAll')}
            </Button>
            <Button size="sm" onClick={() => setPending(new Set())}>
              {t('permissions.customize.selectNone')}
            </Button>
          </div>
          <span className="text-xs text-text-dim">
            {t('permissions.customize.optionalCount', {
              count: selected.size,
              total: SCOPE_GROUPS.length,
            })}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SCOPE_GROUPS.map((group) => {
            const meta = PERMISSIONS[group];
            const label = t(meta.labelKey);
            return (
              <label
                key={group}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xs border border-line px-3 py-2 md:min-h-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(group)}
                  onChange={() => toggle(group)}
                  aria-label={label}
                  aria-describedby={`permission-${group}-caption`}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
                />
                <span className="block min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {label}
                    {!meta.defaultOn && (
                      <span className="rounded-xs border border-line bg-panel px-1 py-0.5 text-[0.625rem] text-text-dim">
                        {t('permissions.customize.optInTag')}
                      </span>
                    )}
                  </span>
                  <span id={`permission-${group}-caption`} className="block text-xs text-text-dim">
                    {t(meta.captionKey)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" size="sm" disabled={submitting} onClick={() => void submit()}>
            {t('permissions.customize.submit')}
          </Button>
          <Button size="sm" onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

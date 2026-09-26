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
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Checkbox } from '@/components/ui';
import { beginCustomizedAddCharacterLogin } from '@/app/loginFlow';
import { PERMISSIONS, SCOPE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { useCustomizePermissionsSelection } from './customizeSelection';

interface CustomizePermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The dialog reads differently at each entry point (Login's "log in", Characters' "add"); defaults to Login's own wording. */
  title?: string;
}

/** The Core Grant's two user-facing rows — see the module doc for why these are hand-written rather than derived from `CORE_GRANT`. */
const CORE_ROWS = ['skills', 'structures'] as const;

export function CustomizePermissionsDialog({
  open,
  onClose,
  title,
}: CustomizePermissionsDialogProps) {
  const { t } = useTranslation();
  const stored = useCustomizePermissionsSelection((state) => state.value);
  const hydrated = useCustomizePermissionsSelection((state) => state.hydrated);
  const hydrate = useCustomizePermissionsSelection((state) => state.hydrate);
  const persist = useCustomizePermissionsSelection((state) => state.setValue);

  // `null` means "no edit this open" — the draft follows the stored choice,
  // including once `hydrate()` below lands, the same reasoning
  // `MobileTabsPanel` (Settings.tsx) uses for its own store-backed draft. A
  // reset-on-open effect would need to call `setState` from inside itself,
  // which this avoids entirely: `handleClose` (Escape, backdrop, Cancel, and
  // a successful submit) clears it back to null, so the *next* open computes
  // `selected` fresh from whatever is stored then.
  //
  // Every checkbox and Select all/none/submit stay `disabled` until
  // `hydrated`: without that gate a toggle pressed in the async Dexie read's
  // window would fork `pending` from the store's pre-hydration
  // `DEFAULT_ON_GROUPS`, not the real stored choice, and silently submit over
  // it — the exact bug `customizeSelection.ts`'s own doc warns a stored `[]`
  // must survive.
  const [pending, setPending] = useState<ReadonlySet<ScopeGroup> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = pending ?? new Set(stored);
  const locked = !hydrated || submitting;

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
      // Best-effort: a device-local preference-save failure (quota, private
      // browsing) must never block the login it is attached to.
      try {
        await persist(groups);
      } catch {
        // Intentionally swallowed — see comment above.
      }
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
      title={title ?? t('permissions.customize.title')}
      placement="wide"
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-dim">{t('permissions.customize.intro')}</p>
        <ul className="divide-y divide-line rounded-xs border border-line bg-panel-2">
          {CORE_ROWS.map((key) => (
            <li key={key} className="flex items-start gap-2 px-3 py-2">
              <CaptionedCheckbox
                domId={`core-${key}`}
                label={t(`permissions.core.${key}.label`)}
                caption={t(`permissions.core.${key}.caption`)}
                checked
                disabled
                tag={
                  <span className="rounded-xs border border-line bg-panel px-1 py-0.5 text-[0.625rem] text-text-dim">
                    {t('permissions.customize.requiredTag')}
                  </span>
                }
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button size="sm" disabled={locked} onClick={() => setPending(new Set(SCOPE_GROUPS))}>
              {t('permissions.customize.selectAll')}
            </Button>
            <Button size="sm" disabled={locked} onClick={() => setPending(new Set())}>
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
            return (
              <label
                key={group}
                className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xs border border-line px-3 py-2 md:min-h-0"
              >
                <CaptionedCheckbox
                  domId={`permission-${group}`}
                  label={t(meta.labelKey)}
                  caption={t(meta.captionKey)}
                  checked={selected.has(group)}
                  disabled={locked}
                  onChange={() => toggle(group)}
                  tag={
                    !meta.defaultOn && (
                      <span className="rounded-xs border border-line bg-panel px-1 py-0.5 text-[0.625rem] text-text-dim">
                        {t('permissions.customize.optInTag')}
                      </span>
                    )
                  }
                />
              </label>
            );
          })}
        </div>

        {/* Sticky inside the Modal's own scroll region: the negative margins
          cancel the body's `p-3` so the bar spans edge to edge, flush with the
          bottom. It only visibly differs once the checklist actually scrolls
          (a phone); buttons stay at the default `md` 44px touch tier. */}
        <div className="sticky -bottom-3 -mx-3 -mb-3 flex flex-wrap gap-2 border-t border-line bg-panel px-3 py-2">
          <Button variant="primary" disabled={locked} onClick={() => void submit()}>
            {t('permissions.customize.submit')}
          </Button>
          <Button onClick={handleClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface CaptionedCheckboxProps {
  domId: string;
  label: string;
  caption: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
  tag?: ReactNode;
}

/** The checkbox + label + "unlocks" caption shape both the Core rows and the Permission rows share — the only part of the two lists that was actually identical. */
function CaptionedCheckbox({
  domId,
  label,
  caption,
  checked,
  disabled,
  onChange,
  tag,
}: CaptionedCheckboxProps) {
  const captionId = `${domId}-caption`;
  return (
    <>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        aria-describedby={captionId}
        className="mt-0.5 disabled:cursor-default! disabled:opacity-100!"
      />
      <span className="block min-w-0">
        <span className="flex items-center gap-1.5 font-semibold">
          {label}
          {tag}
        </span>
        <span id={captionId} className="block text-xs text-text-dim">
          {caption}
        </span>
      </span>
    </>
  );
}

import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Checkbox, NeedsConnection } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { DialogFooter } from '@/components/ui/DialogFooter';
import { beginCustomizedAddCharacterLogin } from '@/app/loginFlow';
import { PERMISSIONS, SCOPE_GROUPS, WRITE_GROUPS, type ScopeGroup } from '@/esi/registry';
import { useCustomizePermissionsSelection } from './customizeSelection';
import { DividedList } from '@/components/ui/DividedList';

interface CustomizePermissionsDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

const CORE_ROWS = ['skills', 'structures'] as const;

const READ_GROUPS = SCOPE_GROUPS.filter((group) => !WRITE_GROUPS.includes(group));

export function CustomizePermissionsDialog({
  open,
  onClose,
  title,
}: CustomizePermissionsDialogProps) {
  const { t } = useTranslation();
  const stored = useCustomizePermissionsSelection((state) => state.value);
  const hydrated = useHydratedStore(useCustomizePermissionsSelection);
  const persist = useCustomizePermissionsSelection((state) => state.setValue);

  const [pending, setPending] = useState<ReadonlySet<ScopeGroup> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const selected = pending ?? new Set(stored.groups);
  const locked = !hydrated || submitting;

  function toggle(group: ScopeGroup) {
    const next = new Set(selected);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setPending(next);
  }

  function handleClose() {
    setPending(null);
    setLoginFailed(false);
    onClose();
  }

  async function submit() {
    setSubmitting(true);
    setLoginFailed(false);
    try {
      const groups = [...selected];
      try {
        await persist({ groups });
      } catch {}
      await beginCustomizedAddCharacterLogin(groups);
      setPending(null);
    } catch {
      setSubmitting(false);
      setLoginFailed(true);
    }
  }

  function renderGroup(group: ScopeGroup) {
    const meta = PERMISSIONS[group];
    return (
      <label
        key={group}
        className="flex min-h-9 cursor-pointer items-start gap-2 rounded-xs border border-line px-3 py-2 md:min-h-0"
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
              <span className="rounded-xs bg-panel px-1 py-0.5 text-[0.6875rem] text-text-dim">
                {t('permissions.customize.optInTag')}
              </span>
            )
          }
        />
      </label>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title ?? t('permissions.customize.title')}
      placement="wide"
      footer={
        <>
          {loginFailed && (
            <InlineError className="mb-2">{t('permissions.customize.loginFailed')}</InlineError>
          )}
          <DialogFooter>
            <Button onClick={handleClose} aria-disabled={submitting || undefined}>
              {t('common.cancel')}
            </Button>
            <NeedsConnection>
              <Button
                variant="primary"
                loading={submitting}
                aria-disabled={locked || undefined}
                onClick={() => void submit()}
              >
                {t('permissions.customize.submit')}
              </Button>
            </NeedsConnection>
          </DialogFooter>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-text-dim">{t('permissions.customize.intro')}</p>
        <DividedList as="ul">
          {CORE_ROWS.map((key) => (
            <li key={key} className="flex items-start gap-2 px-3 py-2">
              <CaptionedCheckbox
                domId={`core-${key}`}
                label={t(`permissions.core.${key}.label`)}
                caption={t(`permissions.core.${key}.caption`)}
                checked
                disabled
                tag={
                  <span className="rounded-xs bg-panel px-1 py-0.5 text-[0.6875rem] text-text-dim">
                    {t('permissions.customize.requiredTag')}
                  </span>
                }
              />
            </li>
          ))}
        </DividedList>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              aria-disabled={locked || undefined}
              onClick={() => setPending(new Set(SCOPE_GROUPS))}
            >
              {t('permissions.customize.selectAll')}
            </Button>
            <Button
              size="sm"
              aria-disabled={locked || undefined}
              onClick={() => setPending(new Set())}
            >
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{READ_GROUPS.map(renderGroup)}</div>

        <section aria-labelledby="permissions-write-heading" className="space-y-2">
          <h3 id="permissions-write-heading" className="font-semibold">
            {t('permissions.writeSection')}
          </h3>
          <p className="text-xs text-text-dim">{t('permissions.writeSectionHint')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WRITE_GROUPS.map(renderGroup)}
          </div>
        </section>
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
  const tagId = `${domId}-tag`;
  return (
    <>
      <label className={touchCheckboxLabelClassName}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          aria-label={label}
          aria-describedby={tag ? `${captionId} ${tagId}` : captionId}
          className="mt-0.5 disabled:cursor-default! disabled:opacity-100!"
        />
      </label>
      <span className="block min-w-0">
        <span className="flex items-center gap-1.5 font-semibold">
          {label}
          {tag ? <span id={tagId}>{tag}</span> : null}
        </span>
        <span id={captionId} className="block text-xs text-text-dim">
          {caption}
        </span>
      </span>
    </>
  );
}

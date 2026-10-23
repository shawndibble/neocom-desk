/**
 * `/corp/srp` Settings, the form (issue #4851): on/off, how the amount is worked out (killmail
 * and Jita Appraisal percents), Hull Rules, claim window and Fleet-or-FC. Edits stay in the form
 * until Save; an `UnsavedChangesBar` pins Discard and Save while there are edits. Percents are
 * 1-100 or blank (blank skips that step), as in `engine/srpPricing.ts`.
 */
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Field,
  FieldError,
  Fields,
  Panel,
  TextInput,
  UnsavedChangesBar,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import * as Icon from '@/components/ui/icons';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { useIsPhone } from '@/lib/useIsPhone';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';
import type { SrpOfficerVerdict, SrpSettings } from '../srpTypes';
import { HullRulesEditor } from './HullRulesEditor';
import {
  formFromSettings,
  formIsDirty,
  formProblems,
  formToPatch,
  type SrpSettingsForm,
} from './srpSettingsForm';
import { useHullCatalog } from './useHullCatalog';

interface Props {
  settings: SrpSettings;
  verdict: SrpOfficerVerdict;
  characterId: number;
  onSave: (patch: ReturnType<typeof formToPatch>, enabled: boolean | null) => Promise<void>;
  /** The last save failed (kept by the parent: a half-done save reloads and remounts this form). */
  saveFailed: boolean;
  onReclaim: () => Promise<void>;
}

function PercentField({
  id,
  label,
  note,
  value,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  note: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const errId = `${id}-err`;
  return (
    <Field label={label} htmlFor={id} note={note}>
      <div className="flex items-center gap-2">
        <TextInput
          id={id}
          inputMode="decimal"
          className="w-24"
          value={value}
          placeholder={t('srp.settings.percentOff')}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-text-dim">%</span>
      </div>
      {invalid && (
        <FieldError id={errId} className="w-full">
          {t('srp.settings.percentInvalid')}
        </FieldError>
      )}
    </Field>
  );
}

export function SrpSettingsEditor({
  settings,
  verdict,
  characterId,
  onSave,
  saveFailed,
  onReclaim,
}: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const phone = useIsPhone();
  const hulls = useHullCatalog();
  const [form, setForm] = useState<SrpSettingsForm>(() => formFromSettings(settings));
  const [added, setAdded] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const { copied, flash } = useCopyFeedback<'copied' | 'failed'>(2000);
  const reclaimRef = useRef<HTMLButtonElement>(null);

  const link = `${window.location.origin}/srp`;
  const problems = formProblems(form);
  const dirty = formIsDirty(form, settings);
  const patch = (p: Partial<SrpSettingsForm>) => setForm({ ...form, ...p });

  const toggleClass = (classId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(classId)) next.add(classId);
      return next;
    });

  const addHull = (hullId: number) => {
    setAdded((prev) => (prev.includes(hullId) ? prev : [...prev, hullId]));
    const classId = hulls.catalog?.hull(hullId)?.classId;
    if (classId !== undefined) setExpanded((prev) => new Set(prev).add(classId));
  };

  const copyLink = () =>
    navigator.clipboard.writeText(link).then(
      () => flash('copied'),
      () => flash('failed')
    );

  const save = async () => {
    setSaving(true);
    try {
      await onSave(
        formToPatch(form, settings),
        form.enabled === settings.enabled ? null : form.enabled
      );
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setForm(formFromSettings(settings));
    setAdded([]);
    setExpanded(new Set());
  };

  const copyLabel =
    copied === 'copied'
      ? t('srp.settings.copied')
      : copied === 'failed'
        ? t('srp.settings.copyFailed')
        : t('srp.settings.copyLink');
  const canReclaim = verdict.isCeo && settings.ownerCharacterId !== characterId;
  const windowErrId = `${uid}-win-err`;

  return (
    <div className="grid gap-4">
      <Panel title={t('srp.settings.programTitle')}>
        <div className="grid gap-4">
          <SettingsHint>{t('srp.settings.directorsOnly')}</SettingsHint>
          <Fields variant="form">
            <Field
              label={t('srp.settings.onLabel')}
              htmlFor={`${uid}-on`}
              inline
              note={t('srp.settings.onNote')}
            >
              <label className={touchCheckboxLabelClassName}>
                <Checkbox
                  id={`${uid}-on`}
                  checked={form.enabled}
                  onChange={(e) => patch({ enabled: e.target.checked })}
                />
              </label>
              <span className="text-sm">{t('srp.settings.onValue')}</span>
            </Field>
            <Field
              label={t('srp.settings.linkLabel')}
              htmlFor={`${uid}-link`}
              note={t('srp.settings.linkNote')}
            >
              {phone ? (
                <p id={`${uid}-link`} className="w-full truncate text-sm text-text-dim">
                  {link}
                </p>
              ) : (
                <TextInput id={`${uid}-link`} readOnly value={link} className="min-w-0 flex-1" />
              )}
              <Button className="max-sm:w-full" onClick={() => void copyLink()}>
                {copied === null && (
                  <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} aria-hidden="true" />
                )}
                {copyLabel}
              </Button>
            </Field>
            {canReclaim && (
              <Field label={t('srp.settings.reclaimLabel')} note={t('srp.settings.reclaimNote')}>
                <Button
                  ref={reclaimRef}
                  className="max-sm:w-full"
                  onClick={() => setReclaimOpen(true)}
                >
                  {t('srp.settings.reclaimAction')}
                </Button>
              </Field>
            )}
          </Fields>
        </div>
      </Panel>

      <Panel title={t('srp.settings.amountTitle')}>
        <div className="grid gap-4">
          <ol className="grid max-w-2xl list-decimal gap-1 pl-5 text-sm">
            <li>{t('srp.settings.chain.hull')}</li>
            <li>{t('srp.settings.chain.killmail')}</li>
            <li>{t('srp.settings.chain.appraisal')}</li>
            <li>{t('srp.settings.chain.officer')}</li>
          </ol>
          <Fields variant="form">
            <PercentField
              id={`${uid}-km`}
              label={t('srp.settings.killmailPct')}
              note={t('srp.settings.killmailPctNote')}
              value={form.killmailPct}
              invalid={problems.killmailPct}
              onChange={(killmailPct) => patch({ killmailPct })}
            />
            <PercentField
              id={`${uid}-ap`}
              label={t('srp.settings.appraisalPct')}
              note={t('srp.settings.appraisalPctNote')}
              value={form.appraisalPct}
              invalid={problems.appraisalPct}
              onChange={(appraisalPct) => patch({ appraisalPct })}
            />
          </Fields>
        </div>
      </Panel>

      <Panel
        title={t('srp.settings.hullRules.title')}
        meta={t('srp.settings.hullRules.meta')}
        wrapMeta
      >
        <HullRulesEditor
          form={form}
          onChange={setForm}
          hulls={hulls}
          added={added}
          onAdd={addHull}
          expanded={expanded}
          onToggle={toggleClass}
        />
      </Panel>

      <Panel title={t('srp.settings.claimsTitle')}>
        <Fields variant="form">
          <Field
            label={t('srp.settings.windowLabel')}
            htmlFor={`${uid}-win`}
            note={t('srp.settings.windowNote')}
          >
            <TextInput
              id={`${uid}-win`}
              inputMode="numeric"
              className="w-24"
              value={form.windowDays}
              aria-invalid={problems.windowDays ? true : undefined}
              aria-describedby={problems.windowDays ? windowErrId : undefined}
              onChange={(e) => patch({ windowDays: e.target.value })}
            />
            <span className="text-text-dim">{t('srp.settings.windowUnit')}</span>
            {problems.windowDays && (
              <FieldError id={windowErrId} className="w-full">
                {t('srp.settings.windowInvalid')}
              </FieldError>
            )}
          </Field>
          <Field
            label={t('srp.settings.fleetLabel')}
            htmlFor={`${uid}-fc`}
            inline
            note={t('srp.settings.fleetNote')}
          >
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                id={`${uid}-fc`}
                checked={form.requireFleetOrFc}
                onChange={(e) => patch({ requireFleetOrFc: e.target.checked })}
              />
            </label>
            <span className="text-sm">{t('srp.settings.fleetValue')}</span>
          </Field>
        </Fields>
      </Panel>

      {(dirty || problems.count > 0) && (
        <UnsavedChangesBar
          message={t('srp.settings.unsaved')}
          problems={
            problems.count > 0 ? t('srp.settings.problems', { count: problems.count }) : null
          }
          discardLabel={t('srp.settings.discard')}
          saveLabel={t('srp.settings.save')}
          onDiscard={discard}
          onSave={() => void save()}
          saving={saving}
        >
          {saveFailed && (
            <ActionResult kind="error" className="pt-1">
              {t('srp.settings.saveFailed')}
            </ActionResult>
          )}
        </UnsavedChangesBar>
      )}
      <ConfirmDialog
        open={reclaimOpen}
        title={t('srp.settings.reclaimTitle')}
        body={t('srp.settings.reclaimBody')}
        actionLabel={t('srp.settings.reclaimAction')}
        danger={false}
        cancelLabel={t('common.cancel')}
        failedLabel={t('srp.settings.reclaimFailed')}
        returnFocusFallback={() => reclaimRef.current}
        onConfirm={onReclaim}
        onClose={() => setReclaimOpen(false)}
      />
    </div>
  );
}

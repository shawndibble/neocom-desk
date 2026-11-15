/**
 * Edits Pop Sharing settings (issue #6222): the Sharing default, or one moon's overrides. A
 * moon lists every setting with "Set for this moon"; one left unticked follows the default,
 * so a later change to the default reaches it. A read-only officer sees the same, disabled.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, SegmentedControl, TextArea, TextInput } from '@/components/ui';
import {
  POP_SHARING_KEYS,
  audienceKey,
  type PopAudience,
  type PopSharingKey,
  type PopSharingOverride,
  type PopSharingOverridePatch,
  type PopSharingSettings,
  type PopTime,
} from '../../../../functions/src/popSharing';
import { DialogShell } from './BookDialogs';
import {
  defaultsPatch,
  draftOf,
  moonPatch,
  settingsOfDraft,
  type SettingsDraft,
} from './popSharingForm';

const k = 'corpTaxBook.moons.sharing';

/** A Community the officer can share with: one it is a Member of, or one already chosen. */
export interface CommunityChoice {
  communityId: string;
  name: string;
}

function audienceChoices(chosen: readonly PopAudience[], communities: readonly CommunityChoice[]) {
  const all: PopAudience[] = [{ kind: 'corp' }, { kind: 'alliance' }];
  const seen = new Set(all.map(audienceKey));
  for (const c of [
    ...communities.map((x) => ({ kind: 'community' as const, ...x })),
    ...chosen.filter((a) => a.kind === 'community'),
  ]) {
    if (seen.has(audienceKey(c))) continue;
    seen.add(audienceKey(c));
    all.push(c);
  }
  return all;
}

export function AudienceName({ audience }: { audience: PopAudience }) {
  const { t } = useTranslation();
  return <>{audience.kind === 'community' ? audience.name : t(`${k}.audience.${audience.kind}`)}</>;
}

function Row({
  label,
  own,
  children,
}: {
  label: string;
  /** Moon mode: whether this moon sets the setting itself, and the toggle. */
  own?: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <legend className="text-xs text-text-dim">{label}</legend>
        {own && (
          <label className="flex min-h-9 items-center gap-2 text-xs">
            <Checkbox
              checked={own.checked}
              disabled={own.disabled}
              onChange={(e) => own.onChange(e.target.checked)}
            />
            {t(`${k}.setForMoon`)}
          </label>
        )}
      </div>
      {children}
    </fieldset>
  );
}

export function PopSharingDialog({
  title,
  settings,
  override,
  communities,
  bookRatePct,
  canEdit,
  onClose,
  onSave,
}: {
  title: string;
  /** The settings now in effect: the default, or the moon's effective settings. */
  settings: PopSharingSettings;
  /** Moon mode: what the moon overrides now. Absent edits the Sharing default. */
  override?: PopSharingOverride;
  communities: readonly CommunityChoice[];
  /** The book's own rate, shown for an empty start-link rate. */
  bookRatePct: number | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PopSharingSettings> | PopSharingOverridePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftOf(settings));
  const [own, setOwn] = useState<ReadonlySet<PopSharingKey>>(
    () => new Set(POP_SHARING_KEYS.filter((key) => override?.[key] !== undefined))
  );
  const moon = override !== undefined;
  const next = settingsOfDraft(draft);
  const patch =
    next === null ? null : moon ? moonPatch(override, next, own) : defaultsPatch(settings, next);
  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const editable = (key: PopSharingKey) => canEdit && (!moon || own.has(key));
  const ownToggle = (key: PopSharingKey) =>
    moon
      ? {
          checked: own.has(key),
          disabled: !canEdit,
          onChange: (v: boolean) =>
            setOwn((prev) => {
              const out = new Set(prev);
              if (v) out.add(key);
              else out.delete(key);
              return out;
            }),
        }
      : undefined;
  const chosen = new Set(draft.audiences.map(audienceKey));
  const toggleAudience = (a: PopAudience, on: boolean) =>
    set(
      'audiences',
      on
        ? [...draft.audiences, a]
        : draft.audiences.filter((x) => audienceKey(x) !== audienceKey(a))
    );

  return (
    <DialogShell
      open
      onClose={onClose}
      title={title}
      confirmLabel={t('common.save')}
      canConfirm={canEdit && patch !== null && Object.keys(patch).length > 0}
      run={() => onSave(patch ?? {})}
      showLogged={canEdit ? 'plain' : false}
    >
      <Row label={t(`${k}.fields.audiences`)} own={ownToggle('audiences')}>
        <ul className="space-y-0.5">
          {audienceChoices(draft.audiences, communities).map((a) => (
            <li key={audienceKey(a)}>
              <label className="flex min-h-9 items-center gap-2">
                <Checkbox
                  checked={chosen.has(audienceKey(a))}
                  disabled={!editable('audiences')}
                  onChange={(e) => toggleAudience(a, e.target.checked)}
                />
                <AudienceName audience={a} />
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-dim">{t(`${k}.fields.audiencesHint`)}</p>
      </Row>
      <Row label={t(`${k}.fields.popTime`)} own={ownToggle('popTime')}>
        <SegmentedControl<PopTime>
          label={t(`${k}.fields.popTime`)}
          value={draft.popTime}
          onChange={(v) => set('popTime', v)}
          options={(['ready', 'auto-fracture'] as const).map((value) => ({
            value,
            label: t(`${k}.popTime.${value}`),
            // The selected segment stays live so the value still reads; the other is inert.
            disabled: !editable('popTime') && value !== draft.popTime,
          }))}
        />
      </Row>
      <Row label={t(`${k}.fields.ore`)} own={ownToggle('showOre')}>
        <label className="flex min-h-9 items-center gap-2">
          <Checkbox
            checked={draft.showOre}
            disabled={!editable('showOre')}
            onChange={(e) => set('showOre', e.target.checked)}
          />
          {t(`${k}.fields.showOre`)}
        </label>
      </Row>
      <Row label={t(`${k}.fields.rate`)} own={ownToggle('ratePct')}>
        <TextInput
          inputMode="decimal"
          className="w-40"
          value={draft.rate}
          disabled={!editable('ratePct')}
          placeholder={
            bookRatePct === null ? t(`${k}.bookRate`) : t(`${k}.bookRatePct`, { pct: bookRatePct })
          }
          aria-label={t(`${k}.fields.rate`)}
          onChange={(e) => set('rate', e.target.value)}
        />
        {next === null && (
          <p role="alert" className="text-xs text-danger">
            {t(`${k}.rateInvalid`)}
          </p>
        )}
      </Row>
      <Row label={t(`${k}.fields.notes`)} own={ownToggle('notes')}>
        <TextArea
          rows={3}
          maxLength={500}
          value={draft.notes}
          disabled={!editable('notes')}
          aria-label={t(`${k}.fields.notes`)}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Row>
    </DialogShell>
  );
}

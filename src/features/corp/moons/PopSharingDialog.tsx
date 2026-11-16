/**
 * Edits Pop Sharing settings (issue #6222): the Sharing default, or one moon's overrides. A
 * moon lists every setting with "Set for this moon"; one left unticked follows the default,
 * so a later change to the default reaches it. A read-only officer sees the same, disabled.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, FieldError, SegmentedControl, TextArea, TextInput } from '@/components/ui';
import {
  MAX_POP_NOTES,
  POP_SHARING_KEYS,
  POP_TIMES,
  audienceKey,
  type PopAudience,
  type PopSharingKey,
  type PopSharingOverride,
  type PopSharingOverridePatch,
  type PopSharingSettings,
  type PopTime,
} from '../../../../functions/src/popSharing';
import { popAudienceName } from '../taxBook/popShareMarkLabel';
import { DialogShell } from './BookDialogs';
import {
  defaultsPatch,
  draftOf,
  isEmptyPatch,
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
  return <>{popAudienceName(t, audience)}</>;
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
    <fieldset className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      {/* The legend stays the fieldset's first child so it names the group. */}
      <legend className="float-left py-2 text-xs text-text-dim">{label}</legend>
      {own && (
        <label className="float-right flex min-h-9 items-center gap-2 text-xs">
          <Checkbox
            checked={own.checked}
            disabled={own.disabled}
            onChange={(e) => own.onChange(e.target.checked)}
          />
          {t(`${k}.setForMoon`)}
        </label>
      )}
      <div className="clear-both space-y-1.5">{children}</div>
    </fieldset>
  );
}

export function PopSharingDialog({
  title,
  settings,
  defaults,
  override,
  communities,
  bookRatePct,
  canEdit,
  noAlliance = false,
  onClose,
  onSave,
}: {
  title: string;
  /** The settings now in effect: the default, or the moon's effective settings. */
  settings: PopSharingSettings;
  /** Moon mode: the Sharing default, which a setting returns to when unticked. */
  defaults?: PopSharingSettings;
  /** Moon mode: what the moon overrides now. Absent edits the Sharing default. */
  override?: PopSharingOverride;
  communities: readonly CommunityChoice[];
  /** The book's own rate, shown for an empty start-link rate. */
  bookRatePct: number | null;
  canEdit: boolean;
  /**
   * The book's corporation is in no alliance (public ESI): Alliance reaches nobody, so it says so
   * and is offered disabled, unless already chosen (it can still be unticked).
   */
  noAlliance?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<PopSharingSettings> | PopSharingOverridePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const rateErrorId = useId();
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
          onChange: (v: boolean) => {
            setOwn((prev) => {
              const out = new Set(prev);
              if (v) out.add(key);
              else out.delete(key);
              return out;
            });
            // Unticked, the setting shows the default again (and drops a half-typed value).
            if (!v && defaults) {
              const field = key === 'ratePct' ? 'rate' : key;
              set(field, draftOf(defaults)[field]);
            }
          },
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
      canConfirm={canEdit && patch !== null && !isEmptyPatch(patch)}
      run={() => onSave(patch ?? {})}
      showLogged={canEdit ? 'plain' : false}
    >
      <Row label={t(`${k}.fields.audiences`)} own={ownToggle('audiences')}>
        <ul className="space-y-0.5">
          {audienceChoices(draft.audiences, communities).map((a) => {
            // Chosen before the corporation left its alliance: still untickable, and says why.
            const unreachable = a.kind === 'alliance' && noAlliance;
            return (
              <li key={audienceKey(a)}>
                <label className="flex min-h-9 items-center gap-2">
                  <Checkbox
                    checked={chosen.has(audienceKey(a))}
                    disabled={
                      !editable('audiences') || (unreachable && !chosen.has(audienceKey(a)))
                    }
                    onChange={(e) => toggleAudience(a, e.target.checked)}
                  />
                  <AudienceName audience={a} />
                  {unreachable && (
                    <span className="text-xs text-text-dim">{t(`${k}.noAlliance`)}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-dim">{t(`${k}.fields.audiencesHint`)}</p>
      </Row>
      <Row label={t(`${k}.fields.popTime`)} own={ownToggle('popTime')}>
        <SegmentedControl<PopTime>
          label={t(`${k}.fields.popTime`)}
          value={draft.popTime}
          onChange={(v) => set('popTime', v)}
          options={POP_TIMES.map((value) => ({
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
          aria-describedby={next === null ? rateErrorId : undefined}
          onChange={(e) => set('rate', e.target.value)}
        />
        {next === null && (
          <FieldError id={rateErrorId} className="block text-xs">
            {t(`${k}.rateInvalid`)}
          </FieldError>
        )}
      </Row>
      <Row label={t(`${k}.fields.notes`)} own={ownToggle('notes')}>
        <TextArea
          rows={3}
          maxLength={MAX_POP_NOTES}
          value={draft.notes}
          disabled={!editable('notes')}
          aria-label={t(`${k}.fields.notes`)}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Row>
    </DialogShell>
  );
}

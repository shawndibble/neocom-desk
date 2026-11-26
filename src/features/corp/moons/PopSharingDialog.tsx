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
  own?: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean };
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="border-t border-line pt-3 first:border-t-0 first:pt-0">
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
  settings: PopSharingSettings;
  defaults?: PopSharingSettings;
  override?: PopSharingOverride;
  communities: readonly CommunityChoice[];
  bookRatePct: number | null;
  canEdit: boolean;
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

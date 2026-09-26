/**
 * Picks the Target Profile applied DPS is worked out against, and manages the
 * pilot's custom ones (issue #1546) — create, edit, delete, all synced via
 * `targetProfiles.ts`. A target has a signature, a speed and, optionally,
 * a resist to each damage type — the twin of `DamageProfilePicker`.
 */
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FieldError,
  IconButton,
  Modal,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  BUILT_IN_TARGET_PROFILES,
  isValidTargetProfile,
  type CustomTargetProfile,
  type TargetProfile,
  type TargetResists,
} from '@/engine/fittings/targetProfile';

const RESIST_TYPES = ['em', 'thermal', 'kinetic', 'explosive'] as const;

type ResistDraft = Record<keyof TargetResists, string>;

const NO_RESIST_DRAFT: ResistDraft = { em: '', thermal: '', kinetic: '', explosive: '' };

/** "50/40/30/20" — whole percentages, EM first as the game orders them. */
function resistSummary(resists: TargetResists): string {
  return RESIST_TYPES.map((type) => Math.round(resists[type] * 100)).join('/');
}
import {
  newCustomTargetProfileId,
  useTargetProfileName,
  type TargetProfiles,
} from './targetProfiles';

interface Draft {
  id: string | null;
  name: string;
  signatureRadius: string;
  velocity: string;
  /** Percent, as typed; empty is none. */
  resists: ResistDraft;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  signatureRadius: '125',
  velocity: '200',
  resists: NO_RESIST_DRAFT,
};

function draftOf(profile: CustomTargetProfile): Draft {
  const resists = profile.resists;
  return {
    id: profile.id,
    name: profile.name,
    signatureRadius: String(profile.signatureRadius),
    velocity: String(profile.velocity),
    resists: resists
      ? {
          em: String(resists.em * 100),
          thermal: String(resists.thermal * 100),
          kinetic: String(resists.kinetic * 100),
          explosive: String(resists.explosive * 100),
        }
      : NO_RESIST_DRAFT,
  };
}

/**
 * Typed percentages as shares; `undefined` when every one is empty or 0, so
 * a profile without resists keeps the shape it had before resists existed.
 */
function resistsOf(draft: ResistDraft): TargetResists | undefined {
  const resists = Object.fromEntries(
    RESIST_TYPES.map((type) => [type, draft[type] === '' ? 0 : Number(draft[type]) / 100])
  ) as unknown as TargetResists;
  return RESIST_TYPES.every((type) => resists[type] === 0) ? undefined : resists;
}

function ProfileForm({
  draft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onSave: (profile: CustomTargetProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(draft.name);
  const [signatureRadius, setSignatureRadius] = useState(draft.signatureRadius);
  const [velocity, setVelocity] = useState(draft.velocity);
  const [resists, setResists] = useState(draft.resists);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('fittings.targetProfile.errorName'));
      return;
    }
    // An empty speed is a stationary target; an empty signature is invalid.
    const typedResists = resistsOf(resists);
    const values: TargetProfile = {
      signatureRadius: signatureRadius === '' ? Number.NaN : Number(signatureRadius),
      velocity: Number(velocity || 0),
      ...(typedResists ? { resists: typedResists } : {}),
    };
    if (!isValidTargetProfile(values)) {
      setError(t('fittings.targetProfile.errorValues'));
      return;
    }
    onSave({ id: draft.id ?? newCustomTargetProfileId(), name: trimmed, ...values });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xs bg-panel-2 p-2" noValidate>
      <label className="block space-y-1 text-xs text-text-dim">
        <span>{t('fittings.targetProfile.nameLabel')}</span>
        <TextInput
          size="sm"
          className="w-full"
          value={name}
          maxLength={60}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-xs text-text-dim">
          <span>{t('fittings.targetProfile.signatureLabel')}</span>
          <TextInput
            size="sm"
            type="number"
            min={0}
            inputMode="decimal"
            className="w-full"
            value={signatureRadius}
            onChange={(event) => setSignatureRadius(event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-xs text-text-dim">
          <span>{t('fittings.targetProfile.velocityLabel')}</span>
          <TextInput
            size="sm"
            type="number"
            min={0}
            inputMode="decimal"
            className="w-full"
            value={velocity}
            onChange={(event) => setVelocity(event.target.value)}
          />
        </label>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs text-text-dim">
          {t('fittings.targetProfile.resistsLabel')}
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {RESIST_TYPES.map((type) => (
            <label key={type} className="block space-y-1 text-xs text-text-dim">
              <span>{t(`fittings.stats.damageTypeShort.${type}`)}</span>
              <TextInput
                size="sm"
                type="number"
                min={0}
                max={100}
                inputMode="decimal"
                aria-label={t('fittings.targetProfile.resistLabel', {
                  type: t(`fittings.stats.damageType.${type}`),
                })}
                className="w-full"
                value={resists[type]}
                placeholder="0"
                onChange={(event) =>
                  setResists((current) => ({ ...current, [type]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          {t('fittings.targetProfile.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('fittings.targetProfile.save')}
        </Button>
      </div>
    </form>
  );
}

function ManageProfilesModal({
  open,
  onClose,
  targetProfiles,
}: {
  open: boolean;
  onClose: () => void;
  targetProfiles: TargetProfiles;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { custom, saveCustom, deleteCustom } = targetProfiles;

  function close() {
    setDraft(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={t('fittings.targetProfile.manageTitle')}>
      <div className="space-y-3">
        {custom.length === 0 ? (
          <p className="text-sm text-text-dim">{t('fittings.targetProfile.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {custom.map((profile) => (
              <li key={profile.id} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{profile.name}</span>
                <span className="shrink-0 text-xs text-text-dim">
                  {t('fittings.targetProfile.summary', {
                    signature: profile.signatureRadius,
                    velocity: profile.velocity,
                  })}
                  {profile.resists &&
                    t('fittings.targetProfile.resistSummary', {
                      resists: resistSummary(profile.resists),
                    })}
                </span>
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<Icon.Rename />}
                  label={t('fittings.targetProfile.edit', { name: profile.name })}
                  onClick={() => setDraft(draftOf(profile))}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('fittings.targetProfile.delete', { name: profile.name })}
                  onClick={() => {
                    deleteCustom(profile.id);
                    if (draft?.id === profile.id) setDraft(null);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {draft ? (
          <ProfileForm
            key={draft.id ?? 'new'}
            draft={draft}
            onCancel={() => setDraft(null)}
            onSave={(profile) => {
              saveCustom(profile);
              setDraft(null);
            }}
          />
        ) : (
          <Button size="sm" onClick={() => setDraft(EMPTY_DRAFT)}>
            {t('fittings.targetProfile.add')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function TargetProfilePicker({ targetProfiles }: { targetProfiles: TargetProfiles }) {
  const { t } = useTranslation();
  const nameOf = useTargetProfileName();
  const [managing, setManaging] = useState(false);
  const label = t('fittings.targetProfile.label');
  const { selected } = targetProfiles;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <Select value={selected.id} onValueChange={targetProfiles.select}>
        <SelectTrigger aria-label={label} size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('fittings.targetProfile.builtInGroup')}</SelectLabel>
            {BUILT_IN_TARGET_PROFILES.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {nameOf(profile)}
              </SelectItem>
            ))}
          </SelectGroup>
          {targetProfiles.custom.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t('fittings.targetProfile.customGroup')}</SelectLabel>
                {targetProfiles.custom.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <span className="text-text-dim">
        {t('fittings.targetProfile.summary', {
          signature: selected.signatureRadius,
          velocity: selected.velocity,
        })}
        {selected.resists &&
          t('fittings.targetProfile.resistSummary', {
            resists: resistSummary(selected.resists),
          })}
      </span>
      <Button size="sm" onClick={() => setManaging(true)}>
        {t('fittings.targetProfile.manage')}
      </Button>
      <ManageProfilesModal
        open={managing}
        onClose={() => setManaging(false)}
        targetProfiles={targetProfiles}
      />
    </div>
  );
}

/**
 * Picks the Target Profile applied DPS is worked out against, and manages the
 * pilot's custom ones (issue #1546) — create, edit, delete, all synced via
 * `targetProfiles.ts`. The two-field twin of `DamageProfilePicker`.
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
} from '@/engine/fittings/targetProfile';
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
}

const EMPTY_DRAFT: Draft = { id: null, name: '', signatureRadius: '125', velocity: '200' };

function draftOf(profile: CustomTargetProfile): Draft {
  return {
    id: profile.id,
    name: profile.name,
    signatureRadius: String(profile.signatureRadius),
    velocity: String(profile.velocity),
  };
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
    const values = {
      signatureRadius: signatureRadius === '' ? Number.NaN : Number(signatureRadius),
      velocity: Number(velocity || 0),
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
        <SelectTrigger aria-label={label} className="w-48">
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

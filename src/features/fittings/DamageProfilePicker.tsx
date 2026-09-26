/**
 * Picks the Damage Profile the Defense section's EHP is measured against, and
 * manages the pilot's custom ones (issue #1545) — create, edit, delete, all
 * synced via `damageProfiles.ts`.
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
  BUILT_IN_DAMAGE_PROFILES,
  isValidDamageProfile,
  type CustomDamageProfile,
} from '@/engine/fittings/damageProfile';
import {
  newCustomDamageProfileId,
  useDamageProfileName,
  type DamageProfiles,
} from './damageProfiles';

const DAMAGE_TYPES = ['em', 'thermal', 'kinetic', 'explosive'] as const;

interface Draft {
  id: string | null;
  name: string;
  values: Record<(typeof DAMAGE_TYPES)[number], string>;
}

const EMPTY_DRAFT: Draft = {
  id: null,
  name: '',
  values: { em: '25', thermal: '25', kinetic: '25', explosive: '25' },
};

function draftOf(profile: CustomDamageProfile): Draft {
  return {
    id: profile.id,
    name: profile.name,
    values: {
      em: String(profile.em),
      thermal: String(profile.thermal),
      kinetic: String(profile.kinetic),
      explosive: String(profile.explosive),
    },
  };
}

function ProfileForm({
  draft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onSave: (profile: CustomDamageProfile) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(draft.name);
  const [values, setValues] = useState(draft.values);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError(t('fittings.damageProfile.errorName'));
      return;
    }
    // An empty field counts as 0 — "30 / 70 / blank / blank" is a fine mix.
    const mix = {
      em: Number(values.em || 0),
      thermal: Number(values.thermal || 0),
      kinetic: Number(values.kinetic || 0),
      explosive: Number(values.explosive || 0),
    };
    if (!isValidDamageProfile(mix)) {
      setError(t('fittings.damageProfile.errorMix'));
      return;
    }
    onSave({ id: draft.id ?? newCustomDamageProfileId(), name: trimmed, ...mix });
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xs bg-panel-2 p-2" noValidate>
      <label className="block space-y-1 text-xs text-text-dim">
        <span>{t('fittings.damageProfile.nameLabel')}</span>
        <TextInput
          size="sm"
          className="w-full"
          value={name}
          maxLength={60}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DAMAGE_TYPES.map((type) => (
          <label key={type} className="block space-y-1 text-xs text-text-dim">
            <span>{t(`fittings.stats.damageType.${type}`)}</span>
            <TextInput
              size="sm"
              type="number"
              min={0}
              inputMode="decimal"
              className="w-full"
              value={values[type]}
              onChange={(event) => setValues((prev) => ({ ...prev, [type]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-text-dim">{t('fittings.damageProfile.ratioHint')}</p>
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          {t('fittings.damageProfile.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit">
          {t('fittings.damageProfile.save')}
        </Button>
      </div>
    </form>
  );
}

function ManageProfilesModal({
  open,
  onClose,
  damageProfiles,
}: {
  open: boolean;
  onClose: () => void;
  damageProfiles: DamageProfiles;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { custom, saveCustom, deleteCustom } = damageProfiles;

  function close() {
    setDraft(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={t('fittings.damageProfile.manageTitle')}>
      <div className="space-y-3">
        {custom.length === 0 ? (
          <p className="text-sm text-text-dim">{t('fittings.damageProfile.empty')}</p>
        ) : (
          <ul className="space-y-1">
            {custom.map((profile) => (
              <li key={profile.id} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{profile.name}</span>
                <span className="shrink-0 text-xs text-text-dim">
                  {DAMAGE_TYPES.map((type) => profile[type]).join(' / ')}
                </span>
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<Icon.Rename />}
                  label={t('fittings.damageProfile.edit', { name: profile.name })}
                  onClick={() => setDraft(draftOf(profile))}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('fittings.damageProfile.delete', { name: profile.name })}
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
            {t('fittings.damageProfile.add')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function DamageProfilePicker({ damageProfiles }: { damageProfiles: DamageProfiles }) {
  const { t } = useTranslation();
  const nameOf = useDamageProfileName();
  const [managing, setManaging] = useState(false);
  const label = t('fittings.damageProfile.label');

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <Select value={damageProfiles.selected.id} onValueChange={damageProfiles.select}>
        <SelectTrigger aria-label={label} size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('fittings.damageProfile.builtInGroup')}</SelectLabel>
            {BUILT_IN_DAMAGE_PROFILES.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {nameOf(profile)}
              </SelectItem>
            ))}
          </SelectGroup>
          {damageProfiles.custom.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t('fittings.damageProfile.customGroup')}</SelectLabel>
                {damageProfiles.custom.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={() => setManaging(true)}>
        {t('fittings.damageProfile.manage')}
      </Button>
      <ManageProfilesModal
        open={managing}
        onClose={() => setManaging(false)}
        damageProfiles={damageProfiles}
      />
    </div>
  );
}

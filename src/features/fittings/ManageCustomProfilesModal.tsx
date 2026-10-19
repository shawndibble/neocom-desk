/**
 * The "manage custom profiles" modal shared by the Damage and Target Profile
 * pickers: list the pilot's custom profiles with edit and delete, and an add
 * button. The profile-specific parts — a row's summary and the edit form —
 * come in as props.
 */
import { useState, type ReactNode } from 'react';
import { Button, IconButton, Modal } from '@/components/ui';
import * as Icon from '@/components/ui/icons';

/** A form's working copy of a profile; `id` is null while adding a new one. */
interface ProfileDraft {
  id: string | null;
}

export function ManageCustomProfilesModal<
  C extends { id: string; name: string },
  D extends ProfileDraft,
>({
  open,
  onClose,
  title,
  emptyLabel,
  addLabel,
  editLabel,
  deleteLabel,
  custom,
  saveCustom,
  deleteCustom,
  summary,
  draftOf,
  emptyDraft,
  renderForm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  emptyLabel: string;
  addLabel: string;
  editLabel: (name: string) => string;
  deleteLabel: (name: string) => string;
  custom: C[];
  saveCustom: (profile: C) => void;
  deleteCustom: (id: string) => void;
  /** The dim text beside a row's name. */
  summary: (profile: C) => ReactNode;
  draftOf: (profile: C) => D;
  emptyDraft: D;
  renderForm: (props: {
    draft: D;
    onSave: (profile: C) => void;
    onCancel: () => void;
  }) => ReactNode;
}) {
  const [draft, setDraft] = useState<D | null>(null);

  function close() {
    setDraft(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title={title}>
      <div className="space-y-3">
        {custom.length === 0 ? (
          <p className="text-sm text-text-dim">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1">
            {custom.map((profile) => (
              <li key={profile.id} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{profile.name}</span>
                <span className="shrink-0 text-xs text-text-dim">{summary(profile)}</span>
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<Icon.Rename />}
                  label={editLabel(profile.name)}
                  onClick={() => setDraft(draftOf(profile))}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={deleteLabel(profile.name)}
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
          <div key={draft.id ?? 'new'}>
            {renderForm({
              draft,
              onCancel: () => setDraft(null),
              onSave: (profile) => {
                saveCustom(profile);
                setDraft(null);
              },
            })}
          </div>
        ) : (
          <Button size="sm" onClick={() => setDraft(emptyDraft)}>
            {addLabel}
          </Button>
        )}
      </div>
    </Modal>
  );
}

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NativeSelect, Spinner } from '@/components/ui';
import { useCorpOwner } from '@/features/corp/owner';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { loadBuildStructureOptions } from './loadBuildStructures';
import type { BuildStructureOption } from './buildStructures';

interface BuildLocationPickerProps {
  /** Live summary of what the plan is actually set to, already translated. */
  summary: string;
  /** Facility, security and build system — revealed by "Override these". */
  children: ReactNode;
  onPick: (option: BuildStructureOption) => void;
}

/**
 * Where the job runs, in one line instead of three fields.
 *
 * Facility, security and build system are three ways of saying "this
 * structure", and a pilot who has one in mind should not have to translate it
 * into three dropdowns. Picking a corp structure fills all three at once; the
 * summary line then states what the plan is set to, and the fields stay one
 * click away for anyone whose structure is not in the list.
 *
 * **Fill-once, by decision.** Nothing records which structure was picked. The
 * summary always reads the plan's own values, so it cannot drift from them,
 * and a later edit to any field is just an edit — not a conflict with a stored
 * link. The picker is a shortcut, not a binding.
 *
 * The corp read is opt-in: `useCorpSnapshot`'s key stays null until the pilot
 * presses the button, because `/corporations/{id}/structures` is role-gated and
 * rate-limited and must not fire on every Build Plan that opens. For a
 * Character with no corp capability the button never renders at all — the hide
 * rule (CONTEXT.md round 35), same as every other corp surface.
 */
export function BuildLocationPicker({ summary, children, onPick }: BuildLocationPickerProps) {
  const { t } = useTranslation();
  const [overriding, setOverriding] = useState(false);
  const [asked, setAsked] = useState(false);

  const { available, corporationId } = useCorpOwner('canReadStructures');
  const characterId = useActiveCharacter((state) => state.activeCharacterId);

  const structures = useCorpSnapshot<BuildStructureOption[]>(
    asked && available && corporationId !== null && characterId !== null
      ? `${characterId}:${corporationId}`
      : null,
    async () =>
      characterId === null || corporationId === null
        ? []
        : loadBuildStructureOptions(characterId, corporationId)
  );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {available && (
        <div className="flex items-center gap-2">
          {!asked ? (
            <Button size="sm" onClick={() => setAsked(true)}>
              {t('industry.useCorpStructure')}
            </Button>
          ) : structures.loading ? (
            <Spinner size="sm" label={t('industry.corpStructuresLoading')} />
          ) : structures.data && structures.data.length > 0 ? (
            <label className="flex flex-1 flex-col gap-1">
              {t('industry.buildLocation')}
              <NativeSelect
                value=""
                onChange={(e) => {
                  const picked = structures.data?.find(
                    (option) => String(option.structureId) === e.target.value
                  );
                  if (picked) onPick(picked);
                }}
              >
                <option value="">{t('industry.buildLocationPlaceholder')}</option>
                {structures.data.map((option) => (
                  <option key={option.structureId} value={option.structureId}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ) : (
            <span className="text-text-dim">{t('industry.corpStructuresNone')}</span>
          )}
        </div>
      )}

      <p className="text-text-dim">
        {summary}{' '}
        <button
          type="button"
          className="underline"
          aria-expanded={overriding}
          onClick={() => setOverriding((open) => !open)}
        >
          {t(overriding ? 'industry.overrideHide' : 'industry.overrideShow')}
        </button>
      </p>

      {overriding && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>}
    </div>
  );
}

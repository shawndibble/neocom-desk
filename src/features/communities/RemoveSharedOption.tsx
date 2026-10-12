import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { hasShareSelections } from './shareSelection';

/**
 * The logout question (issue #3600): also remove what these Characters shared
 * with their Communities? Shown only when one shares anything. The owner keeps
 * the checked state and defaults it to yes.
 */
export function RemoveSharedOption({
  characterIds,
  checked,
  onChange,
}: {
  characterIds: readonly number[];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const key = characterIds.join(',');
  const shares = useLiveQuery(() => hasShareSelections(characterIds), [key]);
  if (!shares) return null;
  return (
    <label className={`mt-3 flex items-center gap-2 text-xs ${tappableRowClassName}`}>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {t('communities.removeSharedOption', { count: characterIds.length })}
    </label>
  );
}

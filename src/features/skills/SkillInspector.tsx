import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { SkillRequirementsList } from './SkillRequirementsList';
import type { PrereqRow, UnlockRow } from './skillRequirements';

interface SkillInspectorProps {
  skillName: string;
  description?: string | null;
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  onClose: () => void;
}

/** Shows a selected skill's description, prerequisites (trained vs. still needed), and what it unlocks. */
export function SkillInspector({
  skillName,
  description,
  prereqs,
  unlocks,
  onClose,
}: SkillInspectorProps) {
  const { t } = useTranslation();
  return (
    <Panel
      title={skillName}
      actions={
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('skills.inspector.close')}
        </Button>
      }
    >
      {description && <p className="mb-3 text-xs text-text-dim">{description}</p>}
      <SkillRequirementsList prereqs={prereqs} unlocks={unlocks} />
    </Panel>
  );
}

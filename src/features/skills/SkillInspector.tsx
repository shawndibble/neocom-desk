import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { SkillRequirementsList } from './SkillRequirementsList';
import type { PrereqRow, UnlockRow } from './skillRequirements';

interface SkillInspectorProps {
  skillName: string;
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  onClose: () => void;
}

/** Shows a selected skill's prerequisites (trained vs. still needed) and what it unlocks. */
export function SkillInspector({ skillName, prereqs, unlocks, onClose }: SkillInspectorProps) {
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
      <SkillRequirementsList prereqs={prereqs} unlocks={unlocks} />
    </Panel>
  );
}

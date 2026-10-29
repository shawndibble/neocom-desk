import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { useMilestones } from '../useMilestones';

/** Plan Milestones whose entry left the plan entirely: no row remains to flag, so they surface here. */
export function OrphanedMilestoneNotices({
  orphanedMilestones,
  onRemove,
  focusAfterCommit,
  entriesHeadingRef,
}: {
  orphanedMilestones: ReturnType<typeof useMilestones>['orphanedMilestones'];
  onRemove: (milestoneId: string) => void;
  focusAfterCommit: (...targets: RefObject<HTMLElement | null>[]) => void;
  entriesHeadingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {orphanedMilestones.map((status) => (
        <span key={status.milestone.id} className="inline-flex items-center gap-1.5 text-warning">
          {t('plans.milestone.orphanedNotice', { name: status.milestone.name })}
          <IconButton
            icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
            label={t('plans.milestone.removeLabel', { name: status.milestone.name })}
            onClick={() => {
              onRemove(status.milestone.id);
              focusAfterCommit(entriesHeadingRef);
            }}
            size="sm"
            tone="danger"
          />
        </span>
      ))}
    </div>
  );
}

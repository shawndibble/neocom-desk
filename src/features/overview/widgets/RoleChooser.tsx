import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Modal } from '@/components/ui';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { makeWidgetId } from './ids';
import type { OverviewLayout } from './layout';
import { ROLE_IDS, basicsLayout, buildLayoutFromRoles, type RoleId } from './roles';

interface RoleChooserProps {
  firstRun: boolean;
  onChoose: (layout: OverviewLayout) => void;
  onCancel?: () => void;
}

export function RoleChooser({ firstRun, onChoose, onCancel }: RoleChooserProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<readonly RoleId[]>([]);
  const corp = useCorpAccess();
  const held = corp.state === 'ready' ? corp.capabilities : null;
  const toggle = (role: RoleId) =>
    setPicked((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );
  return (
    <section
      className={
        firstRun ? 'grid max-w-3xl gap-3 rounded-xs border border-line bg-panel p-4' : 'grid gap-3'
      }
    >
      {firstRun && <h2 className="text-base font-semibold">{t('overview.roles.title')}</h2>}
      <p className="text-sm text-text-dim">{t('overview.roles.body')}</p>
      <div role="group" aria-label={t('overview.roles.group')} className="flex flex-wrap gap-2">
        {ROLE_IDS.map((role) => (
          <FilterChip
            key={role}
            size="md"
            label={t(`overview.roles.names.${role}`)}
            selected={picked.includes(role)}
            onToggle={() => toggle(role)}
          />
        ))}
      </div>
      <p className="text-sm text-text-dim">{t('overview.roles.always')}</p>
      <span className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => onChoose(buildLayoutFromRoles(picked, held, makeWidgetId))}
        >
          {t('overview.roles.build')}
        </Button>
        {firstRun ? (
          <Button onClick={() => onChoose(basicsLayout(makeWidgetId))}>
            {t('overview.roles.basics')}
          </Button>
        ) : (
          <Button onClick={onCancel}>{t('overview.roles.cancel')}</Button>
        )}
      </span>
    </section>
  );
}

export function RoleChooserDialog({
  open,
  onChoose,
  onClose,
}: {
  open: boolean;
  onChoose: (layout: OverviewLayout) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('overview.roles.titleLater')}>
      <RoleChooser firstRun={false} onChoose={onChoose} onCancel={onClose} />
    </Modal>
  );
}

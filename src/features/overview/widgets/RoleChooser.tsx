/**
 * "What do you do in EVE?": the first-run question, and Customize's "Start from
 * a role". Pick any number of Roles; the four base widgets are always in, and
 * the union of the chosen Roles' kinds follows.
 *
 * First run offers Just the basics (the base four) beside Build my Overview.
 * Reached later, from the edit bar, it is a dialog with Cancel instead, and the
 * layout it builds replaces the current one (undoably: the caller decides).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Modal } from '@/components/ui';
import { makeWidgetId } from './ids';
import type { OverviewLayout } from './layout';
import { ROLE_IDS, basicsLayout, buildLayoutFromRoles, type RoleId } from './roles';

interface RoleChooserProps {
  /** First run: the heading is the question and the second button is Just the basics. */
  firstRun: boolean;
  onChoose: (layout: OverviewLayout) => void;
  /** Reached later: what Cancel does. */
  onCancel?: () => void;
}

export function RoleChooser({ firstRun, onChoose, onCancel }: RoleChooserProps) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<readonly RoleId[]>([]);
  const toggle = (role: RoleId) =>
    setPicked((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    );
  return (
    <section
      className={
        firstRun ? 'grid max-w-2xl gap-3 rounded-xs border border-line bg-panel p-4' : 'grid gap-3'
      }
    >
      {/* The dialog's own title is the heading when this is reached from Customize. */}
      {firstRun && <h2 className="text-lg font-semibold">{t('overview.roles.title')}</h2>}
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
      <p className="text-[0.8125rem] text-text-dim">{t('overview.roles.always')}</p>
      <span className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => onChoose(buildLayoutFromRoles(picked, makeWidgetId))}
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

/** The chooser reached from Customize, as a dialog. */
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

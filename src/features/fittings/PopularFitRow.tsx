import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { RackIconStrip } from './RackIconStrip';

interface PopularFitRowProps {
  /** The row's lead: "6 losses" on zKillboard, the fit's name on EVE Workbench. */
  title: string;
  /** What follows the title, dimmed: " · last seen 2h ago · ~87.5M ISK". */
  meta?: ReactNode;
  modules: ComponentProps<typeof RackIconStrip>['modules'];
  names: ComponentProps<typeof RackIconStrip>['names'];
  /** Lines under the icons: a sighting, a failure. */
  children?: ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}

/**
 * One Popular fit's card body, shared by the zKillboard and EVE Workbench tabs.
 * Renders a fragment: the parent `li` is the card (`FIT_ROW_CLASS`, a flex row).
 */
export function PopularFitRow({
  title,
  meta,
  modules,
  names,
  children,
  disabled = false,
  onOpen,
}: PopularFitRowProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {title}
          <span className="text-text-dim">{meta}</span>
        </p>
        <RackIconStrip modules={modules} names={names} />
        {children}
      </div>
      <Button size="sm" disabled={disabled} onClick={onOpen}>
        {t('fittings.popular.open')}
      </Button>
    </>
  );
}

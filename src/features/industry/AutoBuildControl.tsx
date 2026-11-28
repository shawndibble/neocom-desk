import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Tooltip } from '@/components/ui';
import type { BuildStrategy } from '@/engine/industry/autoMakeOrBuy';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';
import { CraftScopeChips, BuildStrategySelect } from './autoBuildShared';
import { DialogFooter } from '@/components/ui/DialogFooter';

interface AutoBuildControlProps {
  maxDepth: number;
  scope: readonly MakeMethod[];
  disabled?: boolean;
  initialStrategy?: BuildStrategy;
  confirmMessage?: string;
  onApply: (options: { strategy: BuildStrategy }) => void;
  trailing?: ReactNode;
}

export function AutoBuildControl({
  maxDepth,
  scope,
  disabled,
  initialStrategy,
  confirmMessage,
  onApply,
  trailing,
}: AutoBuildControlProps) {
  const { t } = useTranslation();
  const [strategy, setStrategy] = useState<BuildStrategy>(initialStrategy ?? 'cost-effective');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap text-text-dim">
            {t('industry.buildStrategyLabel')}
          </span>
          <BuildStrategySelect strategy={strategy} onChange={setStrategy} size="sm" />
        </label>
        <CraftScopeChips scope={scope} />
        <Tooltip
          content={
            disabled
              ? t('industry.autoBuildWaiting')
              : maxDepth === 0
                ? t('industry.autoBuildNothing')
                : null
          }
        >
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            aria-disabled={disabled || maxDepth === 0 || undefined}
          >
            {t('industry.autoBuildApply')}
          </Button>
        </Tooltip>
        {trailing && <div className="ml-auto flex items-center gap-1">{trailing}</div>}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('industry.autoBuildLabel')}
      >
        <p className="text-xs text-text-dim">{confirmMessage ?? t('industry.autoBuildConfirm')}</p>
        <DialogFooter className="mt-3">
          <Button onClick={() => setConfirmOpen(false)}>{t('industry.cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmOpen(false);
              onApply({ strategy });
            }}
          >
            {t('industry.autoBuildApply')}
          </Button>
        </DialogFooter>
      </Modal>
    </div>
  );
}

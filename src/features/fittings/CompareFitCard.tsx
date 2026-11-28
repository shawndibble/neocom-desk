import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  IconButton,
  IskAmount,
  MenuItem,
  MenuSeparator,
  RowActionsMenu,
  RowMoreActions,
  Spinner,
  Tooltip,
  TypeIcon,
  entityLinkClassName,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import type { Fitting } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { CompareLetterTag } from './CompareCell';
import { CompareCanFlyByCharacter, type CompareCharacter } from './CompareCanFlyByCharacter';
import { fittingEditLocation } from './fittingRoutes';

export type CompareCardBadge = 'baseline' | 'saved' | 'edits';

export const COMPARE_FOCUS_TARGET =
  'button[data-compare-remove], button[aria-haspopup="menu"]' as const;

const VERDICT_TONE_CLASS = {
  good: 'text-success',
  bad: 'text-danger',
  unknown: 'text-text-dim',
} as const;

const CARD_CLASS = 'flex h-full min-w-0 flex-col gap-2 rounded-xs border bg-panel p-3';

function CardShell({ focusIndex, children }: { focusIndex: number; children: ReactNode }) {
  return (
    <div
      data-testid="compare-card"
      data-compare-focus={focusIndex}
      className={cx(CARD_CLASS, 'border-line')}
    >
      {children}
    </div>
  );
}

export function CompareLoadingCard({ focusIndex }: { focusIndex: number }) {
  const { t } = useTranslation();
  return (
    <CardShell focusIndex={focusIndex}>
      <Spinner size="sm" label={t('common.loading')} />
    </CardShell>
  );
}

export function CompareErrorCard({
  letter,
  message,
  focusIndex,
  onRemove,
}: {
  letter: string;
  message: string;
  focusIndex: number;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <CardShell focusIndex={focusIndex}>
      <div className="flex items-start gap-2">
        <CompareLetterTag letter={letter} always />
        <p className="min-w-0 flex-1 text-sm text-danger">{message}</p>
        <IconButton
          icon={<Icon.Close />}
          label={t('fittings.compare.removeNamed', { name: message })}
          tooltip={t('fittings.compare.remove')}
          onClick={onRemove}
          data-compare-remove=""
          tone="danger"
        />
      </div>
    </CardShell>
  );
}

export interface CompareFitCardProps {
  letter: string;
  fitting: Fitting;
  code: string | undefined;
  hullName: string | undefined;
  badges: readonly CompareCardBadge[];
  fits: { text: string; overBudget: boolean } | null;
  fly: { text: string; tone: 'good' | 'bad' | 'unknown' } | null;
  characters: readonly CompareCharacter[];
  price: number | null;
  wins: readonly string[];
  statsFailed: boolean;
  focusIndex: number;
  onMakeBaseline?: () => void;
  onReplace: () => void;
  onRemove: () => void;
}

export function CompareFitCard({
  letter,
  fitting,
  code,
  hullName,
  badges,
  fits,
  fly,
  characters,
  price,
  wins,
  statsFailed,
  focusIndex,
  onMakeBaseline,
  onReplace,
  onRemove,
}: CompareFitCardProps) {
  const { t } = useTranslation();
  const name = fitting.name || t('fittings.compare.slotFallback', { n: letter });
  const items = (
    <>
      {onMakeBaseline && (
        <MenuItem onSelect={onMakeBaseline}>{t('fittings.compare.makeBaseline')}</MenuItem>
      )}
      <MenuItem onSelect={onReplace}>{t('fittings.compare.replace')}</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={onRemove}>{t('fittings.compare.removeNamed', { name })}</MenuItem>
    </>
  );
  return (
    <RowActionsMenu name={name} items={items} linksKeepBrowserMenu>
      <div
        data-testid="compare-card"
        data-compare-focus={focusIndex}
        className={cx(CARD_CLASS, badges.includes('baseline') ? 'border-accent' : 'border-line')}
      >
        <div className="flex items-start gap-2">
          <TypeIcon
            typeId={fitting.shipTypeId}
            size={64}
            width={44}
            height={44}
            className="rounded-xs"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <CompareLetterTag letter={letter} always />
              {badges.map((badge) => (
                <Pill key={badge} tone={badge === 'baseline' ? 'accent' : 'neutral'}>
                  {t(`fittings.compare.badge.${badge}`)}
                </Pill>
              ))}
            </div>
            {code === undefined ? (
              <span className="mt-1 block truncate font-medium text-text">{name}</span>
            ) : (
              <Tooltip content={t('fittings.compare.openInEditor')}>
                <Link
                  to={fittingEditLocation(code)}
                  className={entityLinkClassName('mt-1 block truncate font-medium')}
                >
                  {name}
                </Link>
              </Tooltip>
            )}
            {hullName && <p className="truncate text-xs text-text-dim">{hullName}</p>}
          </div>
          <RowMoreActions hints={false} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {statsFailed && <span className="text-danger">{t('fittings.compare.statsFailed')}</span>}
          {fits && (
            <span
              className={cx(
                'inline-flex items-center gap-1',
                fits.overBudget ? 'text-danger' : 'text-success'
              )}
            >
              {fits.overBudget ? (
                <Icon.Warn aria-hidden="true" />
              ) : (
                <Icon.Done aria-hidden="true" />
              )}
              {fits.text}
            </span>
          )}
          {fly &&
            (characters.length > 1 ? (
              <CompareCanFlyByCharacter
                fitting={fitting}
                cacheKey={code ?? name}
                characters={characters}
                className={VERDICT_TONE_CLASS[fly.tone]}
              >
                {fly.text}
              </CompareCanFlyByCharacter>
            ) : (
              <span className={VERDICT_TONE_CLASS[fly.tone]}>{fly.text}</span>
            ))}
          {price !== null && (
            <span className="ml-auto text-text-dim tabular-nums">
              <IskAmount value={price} decimals={0} />
            </span>
          )}
        </div>
        {wins.length > 0 && (
          <p className="text-xs text-text-dim">
            {t('fittings.compare.bestAt')} <span className="text-text">{wins.join(', ')}</span>
          </p>
        )}
      </div>
    </RowActionsMenu>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  IskAmount,
  Spinner,
  Tooltip,
  TypeIcon,
  entityLinkClassName,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import type { Fitting } from '@/engine/fittings/types';
import { cx } from '@/lib/cx';
import { CompareCanFlyByCharacter, type CompareCharacter } from './CompareCanFlyByCharacter';
import { fittingEditLocation } from './fittingRoutes';

export type CompareCardBadge = 'baseline' | 'saved' | 'edits';

const VERDICT_TONE_CLASS = {
  good: 'text-success',
  bad: 'text-danger',
  unknown: 'text-text-dim',
} as const;

function CardFrame({ baseline = false, children }: { baseline?: boolean; children: ReactNode }) {
  return (
    <div
      data-testid="compare-card"
      className={cx(
        'flex h-full min-w-0 flex-col gap-2 rounded-xs border bg-panel p-3',
        baseline ? 'border-accent' : 'border-line'
      )}
    >
      {children}
    </div>
  );
}

function LetterTag({ letter }: { letter: string }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-xs bg-panel-2 text-[0.6875rem] font-semibold text-text-dim">
      {letter}
    </span>
  );
}

export function CompareLetterTag({ letter }: { letter: string }) {
  return (
    <span className="md:hidden" aria-hidden="true">
      <LetterTag letter={letter} />
    </span>
  );
}

export function CompareLoadingCard() {
  const { t } = useTranslation();
  return (
    <CardFrame>
      <Spinner size="sm" label={t('common.loading')} />
    </CardFrame>
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
    <CardFrame>
      <div className="flex items-start gap-2">
        <LetterTag letter={letter} />
        <p className="min-w-0 flex-1 text-sm text-danger">{message}</p>
        <IconButton
          icon={<Icon.Close />}
          label={t('fittings.compare.removeNamed', { name: message })}
          tooltip={t('fittings.compare.remove')}
          onClick={onRemove}
          data-compare-remove={focusIndex}
          tone="danger"
        />
      </div>
    </CardFrame>
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
  return (
    <CardFrame baseline={badges.includes('baseline')}>
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
            <LetterTag letter={letter} />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<Icon.More />}
              label={t('fittings.compare.actionsFor', { name })}
              data-compare-remove={focusIndex}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onMakeBaseline && (
              <DropdownMenuItem onSelect={onMakeBaseline}>
                {t('fittings.compare.makeBaseline')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onReplace}>
              {t('fittings.compare.replace')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove}>
              {t('fittings.compare.removeNamed', { name })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            {fits.overBudget ? <Icon.Warn aria-hidden="true" /> : <Icon.Done aria-hidden="true" />}
            {fits.text}
          </span>
        )}
        {fly &&
          (characters.length > 1 ? (
            <CompareCanFlyByCharacter
              fitting={fitting}
              characters={characters}
              className={VERDICT_TONE_CLASS[fly.tone]}
            >
              {fly.text}
            </CompareCanFlyByCharacter>
          ) : (
            <span className={VERDICT_TONE_CLASS[fly.tone]}>{fly.text}</span>
          ))}
        {price !== null && (
          <span className="ml-auto tabular-nums text-text-dim">
            <IskAmount value={price} decimals={0} />
          </span>
        )}
      </div>
      {wins.length > 0 && (
        <p className="text-xs text-text-dim">
          {t('fittings.compare.bestAt')} <span className="text-text">{wins.join(', ')}</span>
        </p>
      )}
    </CardFrame>
  );
}

import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import {
  canDeclare,
  type BookRowView,
  type MemberDeclaration,
} from '@/engine/corpTaxBook/personal';
import { formatIsk } from '@/lib/isk';
import { overdueTarget, type ResolveTarget } from './resolve/targets';

const k = (key: string) => `miningTax.corpBook.declare.${key}`;

/**
 * What the member told the corporation about a Late notice, and its answer (#6206). A rejection
 * reads the officer's reason and their next step word for word: the member is never left with
 * "ask someone" (decision 20261116-194150).
 */
export function CorpDeclarationStatus({
  declaration,
  corpName,
}: {
  declaration: MemberDeclaration;
  corpName: string;
}) {
  const { t } = useTranslation();
  const text =
    declaration.state === 'waiting'
      ? declaration.amount !== undefined
        ? t(k('waitingAmount'), { corp: corpName, amount: formatIsk(declaration.amount, 0) })
        : t(k('waiting'), { corp: corpName })
      : declaration.state === 'confirmed'
        ? t(k('confirmed'), { corp: corpName })
        : t(k('rejected'), { corp: corpName, reason: declaration.reason ?? '' });
  return (
    <>
      <p className={declaration.state === 'rejected' ? 'text-warning' : undefined}>{text}</p>
      {declaration.state === 'rejected' && declaration.nextStep && (
        <p className="font-semibold text-text">
          {t('miningTax.resolve.facts.nextStep', { step: declaration.nextStep })}
        </p>
      )}
    </>
  );
}

/**
 * A book row's declaration slot (#6206): what the member told the corporation about the day's
 * Late notice, and Resolve while they may say it (the same dialog as every other problem, so the
 * corporation's tax contact is mailed too). Nothing without a Late notice.
 */
export function CorpDeclareSlot({
  view,
  onResolve,
}: {
  view: Pick<
    BookRowView,
    'corporationId' | 'corpName' | 'noticeId' | 'characterId' | 'declaration' | 'date'
  >;
  onResolve: (target: ResolveTarget) => void;
}) {
  const { t } = useTranslation();
  if (view.noticeId === undefined) return null;
  const noticeId = view.noticeId;
  return (
    <div className="space-y-1.5">
      {view.declaration && (
        <CorpDeclarationStatus declaration={view.declaration} corpName={view.corpName} />
      )}
      {canDeclare(view.declaration) && (
        <NeedsConnection>
          <Button
            size="sm"
            onClick={() =>
              onResolve(
                overdueTarget({
                  corporationId: view.corporationId,
                  corpName: view.corpName,
                  noticeId,
                  characterId: view.characterId,
                  periodStart: view.date,
                  period: view.date,
                  ...(view.declaration ? { declaration: view.declaration } : {}),
                })
              )
            }
          >
            {t('miningTax.resolve.open')}
          </Button>
        </NeedsConnection>
      )}
    </div>
  );
}

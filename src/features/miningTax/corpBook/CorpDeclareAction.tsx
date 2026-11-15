import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IskInput, NeedsConnection, TextArea } from '@/components/ui';
import {
  canDeclare,
  type BookRowView,
  type MemberDeclaration,
} from '@/engine/corpTaxBook/personal';
import { DialogShell, Label } from '@/features/corp/moons/BookDialogs';
import { formatIsk, parseIskAmount } from '@/lib/isk';
import { declareCorpTaxBookPayment } from './corpBookStore';

const k = (key: string) => `miningTax.corpBook.declare.${key}`;

/** What the member told the corporation about a Statement, and its answer, as one line (#6206). */
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
  return <p className={declaration.state === 'rejected' ? 'text-warning' : undefined}>{text}</p>;
}

interface Props {
  corporationId: number;
  corpName: string;
  statementId: string;
  /** A tracked Character on the Statement: the call is made under its sign-in. */
  characterId: number;
  /** It landed: reload the books. */
  onDeclared: () => void;
}

/**
 * "I paid this another way" on one of the member's own Statements (#6206): a button and the
 * dialog behind it, with an optional amount and note. The corporation's officers see it in
 * Needs you and confirm or reject it; Overdue pauses meanwhile.
 */
export function CorpDeclareAction({
  corporationId,
  corpName,
  statementId,
  characterId,
  onDeclared,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const parsed = amount.trim() === '' ? undefined : parseIskAmount(amount);
  return (
    <>
      <NeedsConnection>
        <Button size="sm" onClick={() => setOpen(true)}>
          {t(k('action'))}
        </Button>
      </NeedsConnection>
      {open && (
        <DialogShell
          open
          onClose={() => setOpen(false)}
          title={t(k('title'))}
          confirmLabel={t(k('confirm'), { corp: corpName })}
          // Blank is fine; text that is not an amount is not.
          canConfirm={parsed !== null && (parsed === undefined || parsed > 0)}
          showLogged={false}
          run={async () => {
            await declareCorpTaxBookPayment(characterId, {
              corporationId,
              statementId,
              ...(parsed ? { amount: parsed } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
            onDeclared();
          }}
        >
          <p>{t(k('intro'), { corp: corpName })}</p>
          <Label text={t(k('amount'))}>
            <IskInput value={amount} onChange={setAmount} aria-label={t(k('amount'))} />
          </Label>
          <Label text={t(k('note'))}>
            <TextArea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </Label>
        </DialogShell>
      )}
    </>
  );
}

/**
 * A book row's declaration slot (#6206): what the member told the corporation about the day's
 * Statement, and "I paid this another way" while they may say it. Nothing without a Statement.
 */
export function CorpDeclareSlot({
  view,
  onDeclared,
}: {
  view: Pick<
    BookRowView,
    'corporationId' | 'corpName' | 'statementId' | 'characterId' | 'declaration'
  >;
  onDeclared: () => void;
}) {
  if (view.statementId === undefined) return null;
  return (
    <div className="space-y-1.5">
      {view.declaration && (
        <CorpDeclarationStatus declaration={view.declaration} corpName={view.corpName} />
      )}
      {canDeclare(view.declaration) && (
        <CorpDeclareAction
          corporationId={view.corporationId}
          corpName={view.corpName}
          statementId={view.statementId}
          characterId={view.characterId}
          onDeclared={onDeclared}
        />
      )}
    </div>
  );
}

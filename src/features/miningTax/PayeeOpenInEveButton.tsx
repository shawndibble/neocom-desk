/**
 * Settle up's "Open in EVE" for the Payee being paid. A Payee that already
 * knows its EVE entity opens straight away. One that never was verified (a
 * free-text label from before verification existed) is looked up by exact
 * name when pressed; a single match is stored on the Payee, kind and all, so
 * the next Settle up opens it without asking ESI again. No match, or several,
 * says so and sends nothing: a moon label has nothing to open.
 */
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { resolvePayeeName } from './payeeEntitySearch';
import { rememberPayeeEntity } from './payees';

export function PayeeOpenInEveButton({
  name,
  entityId,
  payeeId,
  fromCharacter,
}: {
  name: string;
  /** The Payee's stored EVE entity id, when it has one. */
  entityId?: number;
  payeeId?: string;
  /** The paying Character: the window opens in its client, and the label names it. */
  fromCharacter?: { id: number; name: string };
}) {
  const { t } = useTranslation();
  const from =
    fromCharacter === undefined
      ? {}
      : {
          characterId: fromCharacter.id,
          label: t('miningTax.settleUp.openInEveAs', { name: fromCharacter.name }),
        };
  if (entityId !== undefined) {
    return <OpenInEveButton kind="information" id={entityId} name={name} {...from} />;
  }
  return (
    <OpenInEveButton
      kind="information"
      id={0}
      name={name}
      {...from}
      lookup={{
        unresolvedText: t('miningTax.payees.verify.openUnresolved', { name }),
        resolveId: async () => {
          const matches = await resolvePayeeName(name);
          if (matches.length !== 1) return null;
          const [match] = matches;
          // Remembering is a courtesy: a failed write must not stop the open, and a
          // Payee that learned its id from a payment meanwhile keeps that one.
          try {
            const payee = payeeId === undefined ? undefined : await db.payees.get(payeeId);
            if (payee?.entityId === undefined && payee) {
              await rememberPayeeEntity(payee, match.id, match.kind);
            }
          } catch {
            /* opened anyway; the next Settle up looks it up again */
          }
          return match.id;
        },
      }}
    />
  );
}

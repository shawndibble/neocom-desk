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
}: {
  name: string;
  /** The Payee's stored EVE entity id, when it has one. */
  entityId?: number;
  payeeId?: string;
}) {
  const { t } = useTranslation();
  if (entityId !== undefined) {
    return <OpenInEveButton kind="information" id={entityId} name={name} />;
  }
  return (
    <OpenInEveButton
      kind="information"
      id={0}
      name={name}
      lookup={{
        unresolvedText: t('miningTax.payees.verify.openUnresolved', { name }),
        resolveId: async () => {
          const matches = await resolvePayeeName(name).catch(() => []);
          if (matches.length !== 1) return null;
          const [match] = matches;
          const payee = payeeId === undefined ? undefined : await db.payees.get(payeeId);
          if (payee) await rememberPayeeEntity(payee, match.id, match.kind);
          return match.id;
        },
      }}
    />
  );
}

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
  entityId?: number;
  payeeId?: string;
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
          try {
            const payee = payeeId === undefined ? undefined : await db.payees.get(payeeId);
            if (payee?.entityId === undefined && payee) {
              await rememberPayeeEntity(payee, match.id, match.kind);
            }
          } catch {}
          return match.id;
        },
      }}
    />
  );
}

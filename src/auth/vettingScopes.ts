/**
 * What one Vetting sign-in asks EVE for: exactly what the report reads, and nothing the app
 * itself would use. Corporation history is public and needs none. The server checks the token
 * against its own copy (`functions/src/vettingScopes.ts`); `vettingScopes.test.ts` keeps the
 * two in step.
 */
export const VETTING_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_contacts.v1',
  'esi-mail.read_mail.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-skills.read_skills.v1',
] as const;

export type VettingScope = (typeof VETTING_SCOPES)[number];

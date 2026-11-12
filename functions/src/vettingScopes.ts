// The EVE scopes a vetting read asks a pilot for, one per source. Each is optional: a source
// whose scope the token lacks is recorded as not shared and never requested (vettingEsi.ts).
// The client keeps its own copy for the sign-in; a test there pins it to this list.

export const VETTING_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-characters.read_contacts.v1',
  'esi-mail.read_mail.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-skills.read_skills.v1',
] as const;

export type VettingScope = (typeof VETTING_SCOPES)[number];

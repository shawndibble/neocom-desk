/**
 * ESI OAuth scopes for NeoCom Desk v1. Read-only by design (see CONTEXT.md).
 * esi-markets.structure_markets.v1 deliberately excluded: v1 trade hubs are
 * NPC stations only, which need no scope.
 */
export const SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-clones.read_implants.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-mail.read_mail.v1',
  'esi-calendar.read_calendar_events.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-markets.read_character_orders.v1',
  'esi-characters.read_blueprints.v1',
  'esi-industry.read_character_jobs.v1',
] as const;

export type Scope = (typeof SCOPES)[number];

/** Space-joined form for the SSO authorize URL `scope` parameter. */
export const SCOPES_STRING: string = SCOPES.join(' ');

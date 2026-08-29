// Kicks off EVE SSO: stash PKCE state, then leave the app for login.eveonline.com.
import { startLogin } from '@/auth/session';
import { SCOPES } from '@/esi/scopes';
import { assignLocation } from './navigation';

export async function beginEveLogin(): Promise<void> {
  assignLocation(await startLogin([...SCOPES]));
}

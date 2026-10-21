// Callable router: many related callables served by ONE deployed function.
//
// Every deployed function is one mutation request to Cloud Functions on
// `firebase deploy`, and a full deploy of ~80 of them exceeds the per-minute
// quota (429). A group of callables registers its handlers here and exports a
// single router callable; the old per-name exports stay (built from the same
// handler) until every client has switched, then they are deleted.
//
// The client calls the router with `{ action, data }`; `action` is the old
// callable's export name, and `data` is exactly what that callable received.

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type CallableHandler = (request: CallableRequest<unknown>) => unknown;

export interface ActionGroup {
  /** Records `handler` under `name` and returns it, so the caller can also export it standalone. */
  register: (name: string, handler: CallableHandler) => CallableHandler;
  /** The router's handler: picks the registered handler by `request.data.action`. */
  route: CallableHandler;
}

export function createActionGroup(): ActionGroup {
  const handlers = new Map<string, CallableHandler>();
  return {
    register(name, handler) {
      if (handlers.has(name)) throw new Error(`Duplicate callable action: ${name}`);
      handlers.set(name, handler);
      return handler;
    },
    route(request) {
      const body = request.data;
      const action =
        typeof body === 'object' && body !== null ? (body as { action?: unknown }).action : null;
      const handler = typeof action === 'string' ? handlers.get(action) : undefined;
      if (!handler) throw new HttpsError('invalid-argument', 'Unknown action');
      return handler({ ...request, data: (body as { data?: unknown }).data });
    },
  };
}

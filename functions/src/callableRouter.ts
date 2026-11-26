import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export type CallableHandler = (request: CallableRequest<unknown>) => unknown;

export interface ActionGroup {
  register: (name: string, handler: CallableHandler) => CallableHandler;
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

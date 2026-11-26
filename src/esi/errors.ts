export class EsiError extends Error {
  readonly status: number;
  readonly body: unknown;
  endpointId?: string;

  constructor(status: number, message: string, body?: unknown, endpointId?: string) {
    super(message);
    this.name = 'EsiError';
    this.status = status;
    this.body = body;
    this.endpointId = endpointId;
  }
}

export function attachEndpointId(err: unknown, endpointId: string | undefined): void {
  if (err instanceof EsiError && err.endpointId === undefined && endpointId !== undefined) {
    err.endpointId = endpointId;
  }
}

export type ThrottleStatus = 420 | 429;

export type BudgetRefusal = 'errorLimit' | 'rateLimit' | 'pacing';

export class EsiBudgetError extends EsiError {
  readonly reason: BudgetRefusal;
  readonly retryAfterMs: number;

  constructor(reason: BudgetRefusal, retryAfterMs: number) {
    super(
      0,
      `ESI budget (${reason}) declined to send; retry in ${Math.round(retryAfterMs / 1000)}s`
    );
    this.name = 'EsiBudgetError';
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

export class EsiTimeoutError extends EsiError {
  readonly timeoutMs: number;
  readonly sent: boolean;

  constructor(timeoutMs: number, sent = true) {
    super(0, `ESI request timed out after ${timeoutMs}ms${sent ? '' : ' waiting at the gate'}`);
    this.name = 'EsiTimeoutError';
    this.timeoutMs = timeoutMs;
    this.sent = sent;
  }
}

export class EsiOfflineError extends EsiError {
  constructor(cause?: unknown) {
    super(0, 'The access token could not be refreshed: no network');
    this.name = 'EsiOfflineError';
    if (cause !== undefined) this.cause = cause;
  }
}

export class EsiSsoUnavailableError extends EsiError {
  readonly ssoStatus: number;

  constructor(ssoStatus: number, cause?: unknown) {
    super(0, `EVE's login service answered ${ssoStatus}: the token could not be refreshed`);
    this.name = 'EsiSsoUnavailableError';
    this.ssoStatus = ssoStatus;
    if (cause !== undefined) this.cause = cause;
  }
}

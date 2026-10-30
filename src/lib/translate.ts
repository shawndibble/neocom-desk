/** The `t` function as the pure text builders take it, so they stay free of react-i18next. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

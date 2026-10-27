// Flipped to true after the shadow week check (#5290); both paths stay until #5260 removes the old one.
// Off: screens read the whole book client-side as before. On: they read the server-built read models (ADR 0032).
export const CORP_BOOK_READ_MODELS = false;

// Overview and Miners tab (#5259): on since the shadow data check (#5290). Off, they read the
// whole book as before and never read the read models. Both paths stay until #5260.
export const CORP_BOOK_READ_MODELS = true;
// Miner page (#5258): off until its dialogs that list other Miners work on a one-Miner read (#5704).
// Off, the page reads the whole book as before.
export const CORP_BOOK_MINER_SCOPED_READ = false;

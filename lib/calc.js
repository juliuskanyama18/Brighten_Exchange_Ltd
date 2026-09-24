/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — CALCULATION ENGINE
 *  All exchange mathematics is centralized here. Do not duplicate
 *  these formulas in routes, components, or anywhere else.
 * ============================================================
 *
 *  BUY/SELL SPREAD MODEL, fully live (no manual anchor at all —
 *  removed 2026-09-25, see git history):
 *
 *  Every currency (TL, USD, EUR, GBP) has a "reference" TSh-per-unit rate,
 *  sourced live from ExchangeRate-API and cached in MongoDB:
 *    - TL:          rates.TRY.tzsPerUnit — an IMPLIED cross-rate, since the
 *                    API has no direct TRY->TZS pair. Derived from TRY and
 *                    TZS both being quoted against USD (see lib/rates.js).
 *    - USD/EUR/GBP:  rates[currency].tzsPerUnit — direct from the API.
 *
 *  A margin is applied on top of that reference to get a sell price and a
 *  buy price. The sell and buy margins are INDEPENDENT of each other (e.g.
 *  2026-09-25: buy dropped to 2.5% while sell stayed at 5%), so the two
 *  directions can be priced differently on purpose.
 *
 *  The BUY side (customer sells currency to us) is a percentage for EVERY
 *  currency, including TL — settings.buyMarginPercent.
 *
 *  The SELL side (customer buys currency from us) is a percentage for
 *  USD/EUR/GBP (settings.sellMarginPercent), but TL keeps a FIXED TSh
 *  offset (settings.marginTlTsh) — at TL's magnitude (~50-60 TSh) a
 *  percentage would need constant retuning on that side, and the business
 *  thinks in flat TSh terms there. (2026-09-25: TL's buy side was switched
 *  from a flat TSh offset to match the same percentage as USD/EUR/GBP;
 *  only its sell side kept the flat-TSh mechanism.)
 *
 *    TL:          sellRate = reference + marginTlTsh
 *                 buyRate  = reference * (1 - buyMarginPercent / 100)
 *    USD/EUR/GBP: sellRate = reference * (1 + sellMarginPercent / 100)
 *                 buyRate  = reference * (1 - buyMarginPercent / 100)
 *
 *  This guarantees a margin on EVERY transaction, in EITHER direction,
 *  for EVERY currency.
 *
 *  A. "I SEND TSh"  (customer gives TSh, receives TL/USD/EUR/GBP — we're
 *      selling X to them): foreignAmount = TSh / sellRate(X)
 *
 *  B. "I WANT TSh"  (customer gives TL/USD/EUR/GBP, receives TSh — we're
 *      buying X from them): TSh = amount * buyRate(X)
 * ============================================================
 */

const SUPPORTED_CURRENCIES = ['TL', 'USD', 'EUR', 'GBP'];

/**
 * Parse a user-entered amount that may contain comma thousand separators
 * (e.g. "1,000,000" or "1,250.50"). Returns NaN if not a valid number.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return NaN;
  const cleaned = input.replace(/,/g, '').trim();
  if (cleaned === '') return NaN;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/** Round to 2 decimal places (avoids floating-point noise), without changing magnitude. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The live "fair" reference TSh-per-unit rate for a currency, before any
 * margin is applied. Returns null if unavailable (rates not yet fetched).
 */
export function getReferenceRate(currency, rates) {
  if (currency === 'TL') return rates?.TRY?.tzsPerUnit ?? null;
  return rates?.[currency]?.tzsPerUnit ?? null;
}

/** The price we SELL `currency` at (customer gives TSh, receives currency). */
export function getSellRate(currency, rates, sellMarginPercent, marginTlTsh) {
  const reference = getReferenceRate(currency, rates);
  if (reference === null) return null;
  if (currency === 'TL') return reference + marginTlTsh;
  return reference * (1 + sellMarginPercent / 100);
}

/**
 * The price we BUY `currency` at (customer gives currency, receives TSh).
 * Percentage-based for ALL currencies, including TL (unlike the sell side).
 */
export function getBuyRate(currency, rates, buyMarginPercent) {
  const reference = getReferenceRate(currency, rates);
  if (reference === null) return null;
  return reference * (1 - buyMarginPercent / 100);
}

// ------------------------------------------------------------------
// DIRECTION A — "I send TSh" (customer gives TSh, receives currency)
// ------------------------------------------------------------------

/**
 * Compute a single "I send TSh" output for `currency`, plus the sell rate
 * that was used (for transparency/audit). Returns { amount: null, sellRate: null }
 * if the rate isn't available yet.
 */
export function calculateTshToOne(tshAmount, currency, rates, sellMarginPercent, marginTlTsh) {
  const sellRate = getSellRate(currency, rates, sellMarginPercent, marginTlTsh);
  if (!sellRate) return { amount: null, sellRate: null };
  return { amount: round2(tshAmount / sellRate), sellRate };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. Any currency whose rate is missing is returned as null.
 */
export function calculateTshToAll(tshAmount, rates, sellMarginPercent, marginTlTsh) {
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    result[currency] = calculateTshToOne(tshAmount, currency, rates, sellMarginPercent, marginTlTsh).amount;
  }
  return result;
}

// ------------------------------------------------------------------
// DIRECTION B — "I want TSh" (customer gives currency, receives TSh)
// ------------------------------------------------------------------

/**
 * Full "I want TSh" quote: customer gives TL/USD/EUR/GBP, wants TSh.
 * The margin is already baked into the buy rate — there is no separate
 * commission or sending fee on top.
 */
export function calculateForeignToTsh({ currency, amount, rates, buyMarginPercent }) {
  const buyRate = getBuyRate(currency, rates, buyMarginPercent);
  if (!buyRate) return { finalTsh: null, buyRate: null };
  return { finalTsh: round2(amount * buyRate), buyRate };
}

// ------------------------------------------------------------------
// MASTER DISPATCHER — used by POST /api/quote
// ------------------------------------------------------------------

/**
 * @param direction  'send_tsh' | 'want_tsh'
 * @param currency   required for 'want_tsh'; ignored for 'send_tsh' (all four are returned)
 * @param amount     numeric amount (already parsed)
 * @param settings   Settings document (sellMarginPercent, buyMarginPercent, marginTlTsh)
 * @param rates      { USD: {tzsPerUnit}, EUR: {...}, GBP: {...}, TRY: {tzsPerUnit} }
 */
export function calculateQuote({ direction, currency, amount, settings, rates }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const { sellMarginPercent, buyMarginPercent, marginTlTsh } = settings;

  if (direction === 'send_tsh') {
    const results = calculateTshToAll(amount, rates, sellMarginPercent, marginTlTsh);
    return { direction, tshAmount: amount, results };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }
    const result = calculateForeignToTsh({ currency, amount, rates, buyMarginPercent });
    if (result.finalTsh === null) {
      throw new QuoteError('Rates not available yet. Please try again later.');
    }
    return { direction, currency, amount, ...result };
  }

  throw new QuoteError('Unsupported direction');
}

export class QuoteError extends Error {}

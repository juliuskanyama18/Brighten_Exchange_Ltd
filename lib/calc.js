/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — CALCULATION ENGINE
 *  All exchange mathematics is centralized here. Do not duplicate
 *  these formulas in routes, components, or anywhere else.
 * ============================================================
 *
 *  BUY/SELL SPREAD MODEL (replaces the old anchor+commission+fee model,
 *  2026-09-25 — see conversation history):
 *
 *  Every currency (TL, USD, EUR, GBP) has a single "reference" TSh-per-unit
 *  rate:
 *    - TL:          settings.anchorTshPerTl — a manual business rate the
 *                    admin sets by hand (e.g. from XE). NEVER touched by
 *                    the ExchangeRate-API.
 *    - USD/EUR/GBP:  rates[currency].tzsPerUnit — fetched from
 *                    ExchangeRate-API and cached in MongoDB.
 *
 *  settings.marginPercent (a single percentage, e.g. 5) is applied to that
 *  reference rate to derive a sell price and a buy price:
 *    sellRate(X) = reference(X) * (1 + marginPercent / 100)   -- customer BUYS X from us
 *    buyRate(X)  = reference(X) * (1 - marginPercent / 100)   -- customer SELLS X to us
 *
 *  This guarantees a margin on EVERY transaction, in EITHER direction,
 *  for EVERY currency — unlike the old model, where only the "I want TSh"
 *  direction reliably profited (via a separate commission+fee), and the
 *  "I send TSh" direction only profited if the anchor happened to sit
 *  above the real market rate.
 *
 *  A. "I SEND TSh"  (customer gives TSh, receives TL/USD/EUR/GBP — we're
 *      selling X to them): foreignAmount = TSh / sellRate(X)
 *
 *  B. "I WANT TSh"  (customer gives TL/USD/EUR/GBP, receives TSh — we're
 *      buying X from them): TSh = amount * buyRate(X)
 * ============================================================
 */

const FOREIGN_CURRENCIES = ['USD', 'EUR', 'GBP'];
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
 * The "fair" reference TSh-per-unit rate for a currency, before any margin
 * is applied. TL comes from the manual anchor; USD/EUR/GBP come from the
 * cached ExchangeRate-API rates. Returns null if unavailable (foreign
 * currency rate not yet fetched).
 */
export function getReferenceRate(currency, anchorTshPerTl, rates) {
  if (currency === 'TL') return anchorTshPerTl;
  return rates?.[currency]?.tzsPerUnit ?? null;
}

/** The price we SELL `currency` at (customer gives TSh, receives currency). */
export function getSellRate(currency, anchorTshPerTl, rates, marginPercent) {
  const reference = getReferenceRate(currency, anchorTshPerTl, rates);
  if (reference === null) return null;
  return reference * (1 + marginPercent / 100);
}

/** The price we BUY `currency` at (customer gives currency, receives TSh). */
export function getBuyRate(currency, anchorTshPerTl, rates, marginPercent) {
  const reference = getReferenceRate(currency, anchorTshPerTl, rates);
  if (reference === null) return null;
  return reference * (1 - marginPercent / 100);
}

// ------------------------------------------------------------------
// DIRECTION A — "I send TSh" (customer gives TSh, receives currency)
// ------------------------------------------------------------------

/**
 * Compute a single "I send TSh" output for `currency`, plus the sell rate
 * that was used (for transparency/audit). Returns { amount: null, sellRate: null }
 * if the rate isn't available yet.
 */
export function calculateTshToOne(tshAmount, currency, anchorTshPerTl, rates, marginPercent) {
  const sellRate = getSellRate(currency, anchorTshPerTl, rates, marginPercent);
  if (!sellRate) return { amount: null, sellRate: null };
  return { amount: round2(tshAmount / sellRate), sellRate };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. Any currency whose rate is missing is returned as null.
 */
export function calculateTshToAll(tshAmount, anchorTshPerTl, rates, marginPercent) {
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    result[currency] = calculateTshToOne(tshAmount, currency, anchorTshPerTl, rates, marginPercent).amount;
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
export function calculateForeignToTsh({ currency, amount, anchorTshPerTl, rates, marginPercent }) {
  const buyRate = getBuyRate(currency, anchorTshPerTl, rates, marginPercent);
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
 * @param settings   Settings document (anchorTshPerTl, marginPercent)
 * @param rates      { USD: {tzsPerUnit}, EUR: {...}, GBP: {...} }
 */
export function calculateQuote({ direction, currency, amount, settings, rates }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const anchorTshPerTl = settings.anchorTshPerTl;
  const marginPercent = settings.marginPercent;

  if (direction === 'send_tsh') {
    const results = calculateTshToAll(amount, anchorTshPerTl, rates, marginPercent);
    return { direction, tshAmount: amount, results };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }
    const result = calculateForeignToTsh({ currency, amount, anchorTshPerTl, rates, marginPercent });
    if (result.finalTsh === null) {
      throw new QuoteError('Rates not available yet. Please try again later.');
    }
    return { direction, currency, amount, ...result };
  }

  throw new QuoteError('Unsupported direction');
}

export class QuoteError extends Error {}

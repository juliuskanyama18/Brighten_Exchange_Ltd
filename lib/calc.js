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
 *  buy price. TL uses a FIXED TSh offset (settings.marginTlTsh) rather than
 *  a percentage — at TL's magnitude (~50-60 TSh) a percentage would need
 *  constant retuning, and the business thinks in flat TSh terms for TL.
 *  USD/EUR/GBP use a percentage (settings.marginPercent), since a flat TSh
 *  offset would be meaningless at their magnitude (~2,000-4,000 TSh/unit).
 *
 *    TL:          sellRate = reference + marginTlTsh
 *                 buyRate  = reference - marginTlTsh
 *    USD/EUR/GBP: sellRate = reference * (1 + marginPercent / 100)
 *                 buyRate  = reference * (1 - marginPercent / 100)
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
export function getSellRate(currency, rates, marginPercent, marginTlTsh) {
  const reference = getReferenceRate(currency, rates);
  if (reference === null) return null;
  if (currency === 'TL') return reference + marginTlTsh;
  return reference * (1 + marginPercent / 100);
}

/** The price we BUY `currency` at (customer gives currency, receives TSh). */
export function getBuyRate(currency, rates, marginPercent, marginTlTsh) {
  const reference = getReferenceRate(currency, rates);
  if (reference === null) return null;
  if (currency === 'TL') return reference - marginTlTsh;
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
export function calculateTshToOne(tshAmount, currency, rates, marginPercent, marginTlTsh) {
  const sellRate = getSellRate(currency, rates, marginPercent, marginTlTsh);
  if (!sellRate) return { amount: null, sellRate: null };
  return { amount: round2(tshAmount / sellRate), sellRate };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. Any currency whose rate is missing is returned as null.
 */
export function calculateTshToAll(tshAmount, rates, marginPercent, marginTlTsh) {
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    result[currency] = calculateTshToOne(tshAmount, currency, rates, marginPercent, marginTlTsh).amount;
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
export function calculateForeignToTsh({ currency, amount, rates, marginPercent, marginTlTsh }) {
  const buyRate = getBuyRate(currency, rates, marginPercent, marginTlTsh);
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
 * @param settings   Settings document (marginPercent, marginTlTsh)
 * @param rates      { USD: {tzsPerUnit}, EUR: {...}, GBP: {...}, TRY: {tzsPerUnit} }
 */
export function calculateQuote({ direction, currency, amount, settings, rates }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const marginPercent = settings.marginPercent;
  const marginTlTsh = settings.marginTlTsh;

  if (direction === 'send_tsh') {
    const results = calculateTshToAll(amount, rates, marginPercent, marginTlTsh);
    return { direction, tshAmount: amount, results };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }
    const result = calculateForeignToTsh({ currency, amount, rates, marginPercent, marginTlTsh });
    if (result.finalTsh === null) {
      throw new QuoteError('Rates not available yet. Please try again later.');
    }
    return { direction, currency, amount, ...result };
  }

  throw new QuoteError('Unsupported direction');
}

export class QuoteError extends Error {}

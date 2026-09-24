/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — CALCULATION ENGINE
 *  All exchange mathematics is centralized here. Do not duplicate
 *  these formulas in routes, components, or anywhere else.
 * ============================================================
 *
 *  TL-ANCHORED MODEL (2026-09-25, see git history for the prior
 *  independent-percentage-per-currency model):
 *
 *  TL's live reference rate (rates.TRY.tzsPerUnit — an implied cross-rate,
 *  see lib/rates.js) gets marked up/down by TL's own margin FIRST, and the
 *  result becomes the "anchor" that every other currency's price is
 *  derived from — not by each currency independently marking up its own
 *  live reference rate.
 *
 *    TL sell anchor = TL reference + marginTlTsh        (flat TSh)
 *    TL buy anchor  = TL reference * (1 - buyMarginPercent / 100)
 *
 *    USD/EUR/GBP sell rate = TL sell anchor * tlPerUnit(currency)
 *    USD/EUR/GBP buy rate  = TL buy anchor  * tlPerUnit(currency)
 *
 *  where tlPerUnit(currency) is the live TL-per-1-unit cross rate (e.g. TL
 *  per USD), also fetched from ExchangeRate-API.
 *
 *  IMPORTANT CONSEQUENCE: because tlPerUnit(X) * TL_reference works out to
 *  exactly X's own live tzsPerUnit reference (they're both derived from the
 *  same USD-quoted API response), the BUY side produces IDENTICAL numbers
 *  to "mark up each currency independently" — but the SELL side does NOT,
 *  because marginTlTsh is a FLAT TSh amount, not a percentage. The flat
 *  offset on TL translates to a *different effective percentage* on
 *  USD/EUR/GBP depending on how large the live TL reference rate is that
 *  day (currently ~54 TSh/TL, so +5 flat ≈ +9.2%, not +5%) — and that
 *  effective percentage moves over time as TL's live rate moves, unlike a
 *  fixed sellMarginPercent would. This is intentional per business
 *  decision — TL is the single pricing anchor now.
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
 * Exposed for the admin panel's transparency display — no longer used
 * directly in USD/EUR/GBP pricing (see module docstring).
 */
export function getReferenceRate(currency, rates) {
  if (currency === 'TL') return rates?.TRY?.tzsPerUnit ?? null;
  return rates?.[currency]?.tzsPerUnit ?? null;
}

/** Live TL-per-1-unit cross rate for `currency` (1 for TL itself). */
function getTlPerUnit(currency, rates) {
  if (currency === 'TL') return 1;
  return rates?.[currency]?.tlPerUnit ?? null;
}

/** TL's sell anchor: live TL reference + a flat TSh margin. */
function getTlSellAnchor(rates, marginTlTsh) {
  const tlReference = getReferenceRate('TL', rates);
  if (tlReference === null) return null;
  return tlReference + marginTlTsh;
}

/** TL's buy anchor: live TL reference marked down by a percentage. */
function getTlBuyAnchor(rates, buyMarginPercent) {
  const tlReference = getReferenceRate('TL', rates);
  if (tlReference === null) return null;
  return tlReference * (1 - buyMarginPercent / 100);
}

/**
 * The price we SELL `currency` at (customer gives TSh, receives currency).
 * Derived from the TL sell anchor for every currency, including TL itself.
 */
export function getSellRate(currency, rates, marginTlTsh) {
  const tlSellAnchor = getTlSellAnchor(rates, marginTlTsh);
  if (tlSellAnchor === null) return null;
  if (currency === 'TL') return tlSellAnchor;
  const tlPerUnit = getTlPerUnit(currency, rates);
  if (tlPerUnit === null) return null;
  return tlSellAnchor * tlPerUnit;
}

/**
 * The price we BUY `currency` at (customer gives currency, receives TSh).
 * Derived from the TL buy anchor for every currency, including TL itself.
 */
export function getBuyRate(currency, rates, buyMarginPercent) {
  const tlBuyAnchor = getTlBuyAnchor(rates, buyMarginPercent);
  if (tlBuyAnchor === null) return null;
  if (currency === 'TL') return tlBuyAnchor;
  const tlPerUnit = getTlPerUnit(currency, rates);
  if (tlPerUnit === null) return null;
  return tlBuyAnchor * tlPerUnit;
}

// ------------------------------------------------------------------
// DIRECTION A — "I send TSh" (customer gives TSh, receives currency)
// ------------------------------------------------------------------

/**
 * Compute a single "I send TSh" output for `currency`, plus the sell rate
 * that was used (for transparency/audit). Returns { amount: null, sellRate: null }
 * if the rate isn't available yet.
 */
export function calculateTshToOne(tshAmount, currency, rates, marginTlTsh) {
  const sellRate = getSellRate(currency, rates, marginTlTsh);
  if (!sellRate) return { amount: null, sellRate: null };
  return { amount: round2(tshAmount / sellRate), sellRate };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. Any currency whose rate is missing is returned as null.
 */
export function calculateTshToAll(tshAmount, rates, marginTlTsh) {
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    result[currency] = calculateTshToOne(tshAmount, currency, rates, marginTlTsh).amount;
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
 * @param settings   Settings document (marginTlTsh, buyMarginPercent)
 * @param rates      { USD: {tzsPerUnit, tlPerUnit}, EUR: {...}, GBP: {...}, TRY: {tzsPerUnit} }
 */
export function calculateQuote({ direction, currency, amount, settings, rates }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const { marginTlTsh, buyMarginPercent } = settings;

  if (direction === 'send_tsh') {
    const results = calculateTshToAll(amount, rates, marginTlTsh);
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

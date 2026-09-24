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
 *    TL buy anchor  = TL reference - buyMarginTlTsh       (flat TSh)
 *
 *    USD/EUR/GBP sell rate = TL sell anchor * tlPerUnit(currency)
 *    USD/EUR/GBP buy rate  = TL buy anchor  * tlPerUnit(currency)
 *
 *  where tlPerUnit(currency) is the live TL-per-1-unit cross rate (e.g. TL
 *  per USD), also fetched from ExchangeRate-API.
 *
 *  IMPORTANT CONSEQUENCE: both margins are FLAT TSh amounts applied to TL's
 *  own rate (2026-09-25: buy side switched back from a percentage to match
 *  the sell side), so NEITHER side reduces to a fixed percentage on
 *  USD/EUR/GBP. A flat offset on TL translates to a *different effective
 *  percentage* on USD/EUR/GBP depending on how large the live TL reference
 *  rate is that day (currently ~54 TSh/TL, so +5 flat ≈ +9.2%, not +5%) —
 *  and that effective percentage moves over time as TL's live rate moves.
 *  This is intentional per business decision — TL is the single pricing
 *  anchor now, and its own flat TSh margins are what everything else
 *  inherits.
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

/** TL's buy anchor: live TL reference marked down by a flat TSh amount. */
function getTlBuyAnchor(rates, buyMarginTlTsh) {
  const tlReference = getReferenceRate('TL', rates);
  if (tlReference === null) return null;
  return tlReference - buyMarginTlTsh;
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
export function getBuyRate(currency, rates, buyMarginTlTsh) {
  const tlBuyAnchor = getTlBuyAnchor(rates, buyMarginTlTsh);
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
export function calculateForeignToTsh({ currency, amount, rates, buyMarginTlTsh }) {
  const buyRate = getBuyRate(currency, rates, buyMarginTlTsh);
  if (!buyRate) return { finalTsh: null, buyRate: null };
  return { finalTsh: round2(amount * buyRate), buyRate };
}

/**
 * REVERSE of calculateForeignToTsh: the exchanger already knows the exact
 * TSh amount the client needs handed over (e.g. client asked for a round
 * number like 270,000 TSh) and needs to know how much of `currency` to
 * collect from them to make that happen. Same buy rate (and, if
 * applicable, the same delivery fee) as the forward calculation — just
 * solved for the input instead of the output.
 */
export function calculateRequiredForeignForTsh({ currency, targetTsh, rates, buyMarginTlTsh, deliveryFeeTl, needsDelivery }) {
  const buyRate = getBuyRate(currency, rates, buyMarginTlTsh);
  if (!buyRate) return { requiredAmount: null, buyRate: null };

  let grossTshNeeded = targetTsh;
  let deliveryFeeTsh = 0;
  if (needsDelivery) {
    const fee = convertDeliveryFeeToTsh(deliveryFeeTl, rates);
    if (fee === null) return { requiredAmount: null, buyRate: null };
    deliveryFeeTsh = fee;
    grossTshNeeded = targetTsh + fee; // need MORE gross so that after the fee, the client still gets exactly targetTsh
  }
  const requiredAmount = round2(grossTshNeeded / buyRate);
  return { requiredAmount, buyRate, grossTshNeeded: round2(grossTshNeeded), deliveryFeeTsh };
}

// ------------------------------------------------------------------
// DELIVERY FEE — optional, opt-in per transaction. A flat TL amount,
// converted into whatever currency the client is RECEIVING and deducted
// from it. Uses the LIVE reference rate (no margin) since this is a
// pass-through cost estimate, not a currency trade.
// ------------------------------------------------------------------

/** Convert the flat TL delivery fee into `currency` (TL/USD/EUR/GBP). */
export function convertDeliveryFeeToForeign(deliveryFeeTl, currency, rates) {
  if (!deliveryFeeTl) return 0;
  if (currency === 'TL') return round2(deliveryFeeTl);
  const tlPerUnit = getTlPerUnit(currency, rates);
  if (!tlPerUnit) return null;
  return round2(deliveryFeeTl / tlPerUnit);
}

/** Convert the flat TL delivery fee into TSh. */
export function convertDeliveryFeeToTsh(deliveryFeeTl, rates) {
  if (!deliveryFeeTl) return 0;
  const tlReference = getReferenceRate('TL', rates);
  if (tlReference === null) return null;
  return round2(deliveryFeeTl * tlReference);
}

// ------------------------------------------------------------------
// MASTER DISPATCHER — used by POST /api/quote
// ------------------------------------------------------------------

/**
 * @param direction      'send_tsh' | 'want_tsh'
 * @param currency       required for 'want_tsh'; ignored for 'send_tsh' (all four are returned)
 * @param amount         numeric amount (already parsed) — meaning depends on `mode` for 'want_tsh'
 * @param settings       Settings document (marginTlTsh, buyMarginTlTsh, deliveryFeeTl)
 * @param rates          { USD: {tzsPerUnit, tlPerUnit}, EUR: {...}, GBP: {...}, TRY: {tzsPerUnit} }
 * @param needsDelivery  if true, deducts the delivery fee from whatever the client receives
 * @param mode           'want_tsh' only: 'given' (default) = amount is what the client is handing
 *                        over, solve for TSh received. 'target' = amount is the exact TSh the
 *                        client needs, solve for how much currency to collect from them.
 */
export function calculateQuote({ direction, currency, amount, settings, rates, needsDelivery = false, mode = 'given' }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const { marginTlTsh, buyMarginTlTsh, deliveryFeeTl } = settings;

  if (direction === 'send_tsh') {
    const grossResults = calculateTshToAll(amount, rates, marginTlTsh);
    if (!needsDelivery) {
      return { direction, tshAmount: amount, results: grossResults, needsDelivery: false };
    }
    const results = {};
    const deliveryFees = {};
    for (const c of SUPPORTED_CURRENCIES) {
      if (grossResults[c] === null) { results[c] = null; deliveryFees[c] = null; continue; }
      const fee = convertDeliveryFeeToForeign(deliveryFeeTl, c, rates);
      deliveryFees[c] = fee;
      results[c] = fee === null ? null : Math.max(round2(grossResults[c] - fee), 0);
    }
    return { direction, tshAmount: amount, results, grossResults, deliveryFees, needsDelivery: true };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }

    if (mode === 'target') {
      const { requiredAmount, buyRate, grossTshNeeded, deliveryFeeTsh } = calculateRequiredForeignForTsh({
        currency, targetTsh: amount, rates, buyMarginTlTsh, deliveryFeeTl, needsDelivery,
      });
      if (requiredAmount === null) {
        throw new QuoteError('Rates not available yet. Please try again later.');
      }
      return {
        direction, currency, mode: 'target', targetTsh: amount,
        requiredAmount, buyRate, grossTshNeeded, deliveryFeeTsh, needsDelivery,
      };
    }

    const result = calculateForeignToTsh({ currency, amount, rates, buyMarginTlTsh });
    if (result.finalTsh === null) {
      throw new QuoteError('Rates not available yet. Please try again later.');
    }
    if (!needsDelivery) {
      return { direction, currency, amount, mode: 'given', ...result, needsDelivery: false };
    }
    const deliveryFeeTsh = convertDeliveryFeeToTsh(deliveryFeeTl, rates);
    if (deliveryFeeTsh === null) {
      throw new QuoteError('Rates not available yet. Please try again later.');
    }
    const grossTsh = result.finalTsh;
    const finalTsh = Math.max(round2(grossTsh - deliveryFeeTsh), 0);
    return { direction, currency, amount, mode: 'given', buyRate: result.buyRate, grossTsh, deliveryFeeTsh, finalTsh, needsDelivery: true };
  }

  throw new QuoteError('Unsupported direction');
}

export class QuoteError extends Error {}

/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — CALCULATION ENGINE
 *  All exchange mathematics is centralized here. Do not duplicate
 *  these formulas in routes, components, or anywhere else.
 * ============================================================
 *
 *  FLAT COMMISSION MODEL (2026-09-30, see git history for the prior
 *  TL-anchored flat-TSh model, and before that an independent-
 *  percentage-per-currency model; 2026-10-01: split the single commission
 *  back into independent sell/buy percentages, admin-configurable):
 *
 *  Two commission percentages (settings.sellMarginPercent,
 *  settings.buyMarginPercent) are applied directly to each currency's own
 *  live reference rate — no anchor currency, no cross-rate routing. Every
 *  currency (including TL) is priced independently off its own live rate:
 *
 *    sellRate(X) = liveRate(X) * (1 + sellMarginPercent / 100)
 *    buyRate(X)  = liveRate(X) * (1 - buyMarginPercent / 100)
 *
 *  Chosen deliberately for a low-volume operation: a flat % per side is
 *  trivial to quote verbally ("5% commission on the market rate") and
 *  trivial to audit, while still letting the sell side and buy side be
 *  tuned independently from the admin panel.
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
 * commission is applied. Returns null if unavailable (rates not yet fetched).
 */
export function getReferenceRate(currency, rates) {
  if (currency === 'TL') return rates?.TRY?.tzsPerUnit ?? null;
  return rates?.[currency]?.tzsPerUnit ?? null;
}

/**
 * The price we SELL `currency` at (customer gives TSh, receives currency):
 * the live reference rate marked UP by the flat commission.
 */
export function getSellRate(currency, rates, sellMarginPercent) {
  const reference = getReferenceRate(currency, rates);
  if (reference === null) return null;
  return reference * (1 + sellMarginPercent / 100);
}

/**
 * The price we BUY `currency` at (customer gives currency, receives TSh):
 * the live reference rate marked DOWN by the flat commission.
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
export function calculateTshToOne(tshAmount, currency, rates, sellMarginPercent) {
  const sellRate = getSellRate(currency, rates, sellMarginPercent);
  if (!sellRate) return { amount: null, sellRate: null };
  return { amount: round2(tshAmount / sellRate), sellRate };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. Any currency whose rate is missing is returned as null.
 */
export function calculateTshToAll(tshAmount, rates, sellMarginPercent) {
  const result = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    result[currency] = calculateTshToOne(tshAmount, currency, rates, sellMarginPercent).amount;
  }
  return result;
}

/**
 * REVERSE of calculateTshToOne: the client doesn't know how much TSh to
 * hand over, but knows exactly how much of `currency` they want to walk
 * away with (e.g. "I want exactly $100"). Same sell rate (and, if
 * applicable, the same delivery fee) as the forward calculation — just
 * solved for the input instead of the output.
 */
export function calculateRequiredTshForForeign({ currency, targetForeignAmount, rates, sellMarginPercent, deliveryFeeTl, needsDelivery }) {
  const sellRate = getSellRate(currency, rates, sellMarginPercent);
  if (!sellRate) return { requiredTsh: null, sellRate: null };

  let grossForeignNeeded = targetForeignAmount;
  let deliveryFeeForeign = 0;
  if (needsDelivery) {
    const fee = convertDeliveryFeeToForeign(deliveryFeeTl, currency, rates);
    if (fee === null) return { requiredTsh: null, sellRate: null };
    deliveryFeeForeign = fee;
    grossForeignNeeded = targetForeignAmount + fee; // need to buy MORE gross so that after the fee, the client still gets exactly targetForeignAmount
  }
  const requiredTsh = round2(grossForeignNeeded * sellRate);
  return { requiredTsh, sellRate, grossForeignNeeded: round2(grossForeignNeeded), deliveryFeeForeign };
}

// ------------------------------------------------------------------
// DIRECTION B — "I want TSh" (customer gives currency, receives TSh)
// ------------------------------------------------------------------

/**
 * Full "I want TSh" quote: customer gives TL/USD/EUR/GBP, wants TSh.
 * The commission is already baked into the buy rate — there is no separate
 * commission or sending fee on top.
 */
export function calculateForeignToTsh({ currency, amount, rates, buyMarginPercent }) {
  const buyRate = getBuyRate(currency, rates, buyMarginPercent);
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
export function calculateRequiredForeignForTsh({ currency, targetTsh, rates, buyMarginPercent, deliveryFeeTl, needsDelivery }) {
  const buyRate = getBuyRate(currency, rates, buyMarginPercent);
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
// from it. Uses the LIVE reference rates (no commission) since this is a
// pass-through cost estimate, not a currency trade.
// ------------------------------------------------------------------

/** Convert the flat TL delivery fee into `currency` (TL/USD/EUR/GBP). */
export function convertDeliveryFeeToForeign(deliveryFeeTl, currency, rates) {
  if (!deliveryFeeTl) return 0;
  if (currency === 'TL') return round2(deliveryFeeTl);
  const tlReference = getReferenceRate('TL', rates);
  const reference = getReferenceRate(currency, rates);
  if (tlReference === null || !reference) return null;
  return round2((deliveryFeeTl * tlReference) / reference);
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
 * @param currency       required for 'want_tsh'; for 'send_tsh' only required when mode is
 *                        'target' (otherwise all four currencies are returned)
 * @param amount         numeric amount (already parsed) — meaning depends on `mode`
 * @param settings       Settings document (sellMarginPercent, buyMarginPercent, deliveryFeeTl)
 * @param rates          { USD: {tzsPerUnit, tlPerUnit}, EUR: {...}, GBP: {...}, TRY: {tzsPerUnit} }
 * @param needsDelivery  if true, deducts the delivery fee from whatever the client receives
 * @param mode           'given' (default) = amount is what the client is handing over, solve for
 *                        what they receive. 'target' = amount is the exact amount the client wants
 *                        to walk away with, solve for what to hand over instead — requires
 *                        `currency` for both directions (this is a single-currency quote, not the
 *                        default 'send_tsh' all-four-at-once shape).
 */
export function calculateQuote({ direction, currency, amount, settings, rates, needsDelivery = false, mode = 'given' }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const { sellMarginPercent, buyMarginPercent, deliveryFeeTl } = settings;

  if (direction === 'send_tsh') {
    if (mode === 'target') {
      if (!SUPPORTED_CURRENCIES.includes(currency)) {
        throw new QuoteError('Unsupported currency');
      }
      const { requiredTsh, sellRate, grossForeignNeeded, deliveryFeeForeign } = calculateRequiredTshForForeign({
        currency, targetForeignAmount: amount, rates, sellMarginPercent, deliveryFeeTl, needsDelivery,
      });
      if (requiredTsh === null) {
        throw new QuoteError('Rates not available yet. Please try again later.');
      }
      return {
        direction, currency, mode: 'target', targetForeignAmount: amount,
        requiredTsh, sellRate, grossForeignNeeded, deliveryFeeForeign, needsDelivery,
      };
    }

    const grossResults = calculateTshToAll(amount, rates, sellMarginPercent);
    if (!needsDelivery) {
      return { direction, tshAmount: amount, mode: 'given', results: grossResults, needsDelivery: false };
    }
    const results = {};
    const deliveryFees = {};
    for (const c of SUPPORTED_CURRENCIES) {
      if (grossResults[c] === null) { results[c] = null; deliveryFees[c] = null; continue; }
      const fee = convertDeliveryFeeToForeign(deliveryFeeTl, c, rates);
      deliveryFees[c] = fee;
      results[c] = fee === null ? null : Math.max(round2(grossResults[c] - fee), 0);
    }
    return { direction, tshAmount: amount, mode: 'given', results, grossResults, deliveryFees, needsDelivery: true };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }

    if (mode === 'target') {
      const { requiredAmount, buyRate, grossTshNeeded, deliveryFeeTsh } = calculateRequiredForeignForTsh({
        currency, targetTsh: amount, rates, buyMarginPercent, deliveryFeeTl, needsDelivery,
      });
      if (requiredAmount === null) {
        throw new QuoteError('Rates not available yet. Please try again later.');
      }
      return {
        direction, currency, mode: 'target', targetTsh: amount,
        requiredAmount, buyRate, grossTshNeeded, deliveryFeeTsh, needsDelivery,
      };
    }

    const result = calculateForeignToTsh({ currency, amount, rates, buyMarginPercent });
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

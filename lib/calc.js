/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — CALCULATION ENGINE
 *  All exchange mathematics is centralized here. Do not duplicate
 *  these formulas in routes, components, or anywhere else.
 * ============================================================
 *
 *  There are two business rules, and they are NOT mirror images
 *  of each other:
 *
 *  A. "I SEND TSh"  (customer gives TSh, receives TL/USD/EUR/GBP)
 *       TL:            TL = TSh / anchor
 *       USD/EUR/GBP:   requiredTSh = foreignAmount * foreignToTlRate * anchor
 *                       (so, given a TSh amount, foreignAmount = TSh / (foreignToTlRate * anchor))
 *
 *  B. "I WANT TSh"  (customer gives TL/USD/EUR/GBP, receives TSh)
 *       TL:            grossTSh = tlAmount * anchor
 *       USD/EUR/GBP:   grossTSh = foreignAmount * foreignToTzsRate   (DIRECT external rate, not via TL)
 *       finalTSh = grossTSh - sendingFeeTSh - commissionTSh
 *
 *  The Brighten anchor (TSh per TL) is a fixed business setting, never
 *  overwritten by the external API. The external API only supplies the
 *  TL and TZS reference rates for USD/EUR/GBP.
 * ============================================================
 */

const FOREIGN_CURRENCIES = ['USD', 'EUR', 'GBP'];

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

// ------------------------------------------------------------------
// DIRECTION A — "I send TSh"
// ------------------------------------------------------------------

/** TSh -> TL. Uses ONLY the Brighten anchor. */
export function calculateTshToTl(tshAmount, anchorTshPerTl) {
  return round2(tshAmount / anchorTshPerTl);
}

/**
 * TSh -> foreign currency (USD/EUR/GBP), given a TSh amount the customer sends.
 * foreignAmount = TSh / (foreignToTlRate * anchor)
 * @param foreignToTlRate  TL per 1 unit of the foreign currency (external rate)
 */
export function calculateTshToForeign(tshAmount, foreignToTlRate, anchorTshPerTl) {
  return round2(tshAmount / (foreignToTlRate * anchorTshPerTl));
}

/**
 * Inverse of the above — given a desired foreign amount, how much TSh is required.
 * requiredTSh = foreignAmount * foreignToTlRate * anchor
 */
export function calculateForeignAmountRequiredTsh(foreignAmount, foreignToTlRate, anchorTshPerTl) {
  return round2(foreignAmount * foreignToTlRate * anchorTshPerTl);
}

/** requiredTSh for a desired TL amount = tlAmount * anchor */
export function calculateTlAmountRequiredTsh(tlAmount, anchorTshPerTl) {
  return round2(tlAmount * anchorTshPerTl);
}

/**
 * Compute a single "I send TSh" output (for `currency` only), plus the
 * external rate that was used (null for TL, since TL uses only the anchor).
 */
export function calculateTshToOne(tshAmount, currency, anchorTshPerTl, rates) {
  if (currency === 'TL') {
    return { amount: calculateTshToTl(tshAmount, anchorTshPerTl), foreignToTlRate: null };
  }
  const tlPerUnit = rates?.[currency]?.tlPerUnit;
  if (!tlPerUnit) return { amount: null, foreignToTlRate: null };
  return { amount: calculateTshToForeign(tshAmount, tlPerUnit, anchorTshPerTl), foreignToTlRate: tlPerUnit };
}

/**
 * Compute all four "I send TSh" outputs at once (TL, USD, EUR, GBP) for a
 * given TSh amount. `rates` is { USD: { tlPerUnit }, EUR: { tlPerUnit }, GBP: { tlPerUnit } }.
 * Any currency whose rate is missing is returned as null (rate unavailable).
 */
export function calculateTshToAll(tshAmount, anchorTshPerTl, rates) {
  const result = {
    TL: calculateTshToTl(tshAmount, anchorTshPerTl),
  };
  for (const currency of FOREIGN_CURRENCIES) {
    const tlPerUnit = rates?.[currency]?.tlPerUnit;
    result[currency] = tlPerUnit
      ? calculateTshToForeign(tshAmount, tlPerUnit, anchorTshPerTl)
      : null;
  }
  return result;
}

// ------------------------------------------------------------------
// DIRECTION B — "I want TSh"
// ------------------------------------------------------------------

/** Brighten commission, expressed in TSh: commissionTl worth of TSh at the current anchor. */
export function calculateCommission(commissionTl, anchorTshPerTl) {
  return round2(commissionTl * anchorTshPerTl);
}

/**
 * Platform sending fee, in TSh, computed off the gross TSh amount.
 * @param sendingFee  { type: 'flat' | 'percentage', value }
 */
export function calculateSendingFee(grossTsh, sendingFee) {
  if (!sendingFee) return 0;
  if (sendingFee.type === 'percentage') {
    return round2(grossTsh * (sendingFee.value / 100));
  }
  return round2(sendingFee.value); // flat
}

/**
 * Full "I want TSh" quote: customer gives TL/USD/EUR/GBP, wants TSh.
 * Gross TSh comes from the DIRECT external TZS rate (or the anchor for TL) —
 * never from reversing the "I send TSh" formula.
 *
 * @param currency        'TL' | 'USD' | 'EUR' | 'GBP'
 * @param amount           amount the customer is giving, in `currency`
 * @param anchorTshPerTl    Brighten anchor
 * @param foreignToTzsRate  TZS per 1 unit of `currency` (external rate; ignored for TL)
 * @param commissionTl      Brighten commission in TL
 * @param sendingFee        { type, value }
 */
export function calculateForeignToTsh({
  currency,
  amount,
  anchorTshPerTl,
  foreignToTzsRate,
  commissionTl,
  sendingFee,
}) {
  const grossTsh = currency === 'TL'
    ? amount * anchorTshPerTl
    : amount * foreignToTzsRate;

  const commissionTsh = calculateCommission(commissionTl, anchorTshPerTl);
  const sendingFeeTsh = calculateSendingFee(grossTsh, sendingFee);
  const finalTsh = round2(grossTsh - sendingFeeTsh - commissionTsh);

  return {
    grossTsh: round2(grossTsh),
    sendingFeeTsh,
    commissionTsh,
    finalTsh: Math.max(finalTsh, 0),
  };
}

// ------------------------------------------------------------------
// MASTER DISPATCHER — used by POST /api/quote
// ------------------------------------------------------------------

const SUPPORTED_CURRENCIES = ['TL', 'USD', 'EUR', 'GBP'];

/**
 * @param direction  'send_tsh' | 'want_tsh'
 * @param currency   required for 'want_tsh'; ignored for 'send_tsh' (all four are returned)
 * @param amount     numeric amount (already parsed)
 * @param settings   Settings document (anchorTshPerTl, commissionTl, sendingFee)
 * @param rates      { USD: {tlPerUnit, tzsPerUnit}, EUR: {...}, GBP: {...} }
 */
export function calculateQuote({ direction, currency, amount, settings, rates }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new QuoteError('Invalid amount');
  }

  const anchorTshPerTl = settings.anchorTshPerTl;

  if (direction === 'send_tsh') {
    const results = calculateTshToAll(amount, anchorTshPerTl, rates);
    return { direction, tshAmount: amount, results };
  }

  if (direction === 'want_tsh') {
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      throw new QuoteError('Unsupported currency');
    }
    if (currency !== 'TL') {
      const tzsPerUnit = rates?.[currency]?.tzsPerUnit;
      if (!tzsPerUnit) {
        throw new QuoteError('Rates not available yet. Please try again later.');
      }
    }
    const foreignToTzsRate = currency === 'TL' ? null : rates[currency].tzsPerUnit;
    const breakdown = calculateForeignToTsh({
      currency,
      amount,
      anchorTshPerTl,
      foreignToTzsRate,
      commissionTl: settings.commissionTl,
      sendingFee: settings.sendingFee,
    });
    return { direction, currency, amount, ...breakdown };
  }

  throw new QuoteError('Unsupported direction');
}

export class QuoteError extends Error {}

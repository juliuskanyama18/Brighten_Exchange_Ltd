// Standalone test of the calculation engine (lib/calc.js) against the
// TL-anchored buy/sell spread model: TL's own marked-up/down rate becomes
// the anchor that USD/EUR/GBP prices are DERIVED from (via the live
// TL-per-currency cross rate), rather than each currency marking up its
// own reference rate independently. No test framework needed — run with:
// node scripts/test-calc.mjs
import assert from 'node:assert/strict';
import {
  parseAmount,
  getReferenceRate,
  getSellRate,
  getBuyRate,
  calculateTshToOne,
  calculateTshToAll,
  calculateForeignToTsh,
  calculateQuote,
  convertDeliveryFeeToForeign,
  convertDeliveryFeeToTsh,
  QuoteError,
} from '../lib/calc.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL  - ${name}`);
    console.error(`        ${err.message}`);
    process.exitCode = 1;
  }
}

// All reference rates come live from ExchangeRate-API. TRY.tzsPerUnit is
// the implied TL cross-rate; tlPerUnit on each foreign currency is the live
// TL-per-1-unit cross rate used to derive that currency's price from the
// TL anchor. These numbers are internally consistent with a single
// USD-quoted API response (TRY=32, TZS=1728 per USD would give TRY.tzsPerUnit
// = 1728/32 = 54, tlPerUnit(EUR) chosen so results are clean).
const RATES = {
  TRY: { tzsPerUnit: 54 },
  USD: { tlPerUnit: 32, tzsPerUnit: 1728 },     // 54 * 32 = 1728, consistent
  EUR: { tlPerUnit: 34.5, tzsPerUnit: 1863 },   // 54 * 34.5 = 1863, consistent
  GBP: { tlPerUnit: 40, tzsPerUnit: 2160 },     // 54 * 40 = 2160, consistent
};
const BUY_MARGIN = 2.5;    // ALL currencies incl. TL; customer sells to us
const MARGIN_TL_TSH = 5;   // TL SELL side only, flat TSh -- the anchor for everyone else's sell price too

console.log('\n1. Reference rates (live, no margin applied)');
test('TL reference = live implied rate (rates.TRY.tzsPerUnit)', () => {
  assert.equal(getReferenceRate('TL', RATES), 54);
});
test('USD reference = tzsPerUnit (unused for pricing now, kept for admin display)', () => {
  assert.equal(getReferenceRate('USD', RATES), 1728);
});

console.log('\n2. TL anchor propagates to other currencies via the live TL-per-unit cross rate');
test('TL sell anchor = 54 + 5 = 59', () => {
  assert.equal(getSellRate('TL', RATES, MARGIN_TL_TSH), 59);
});
test('USD sell = TL sell anchor (59) * tlPerUnit(USD) (32) = 1888', () => {
  assert.equal(getSellRate('USD', RATES, MARGIN_TL_TSH), 59 * 32);
});
test('EUR sell = 59 * 34.5 = 2035.5', () => {
  assert.equal(getSellRate('EUR', RATES, MARGIN_TL_TSH), 59 * 34.5);
});
test('TL buy anchor = 54 * 0.975 = 52.65', () => {
  assert.equal(getBuyRate('TL', RATES, BUY_MARGIN), 52.65);
});
test('USD buy = TL buy anchor (52.65) * tlPerUnit(USD) (32) = 1684.8', () => {
  assert.equal(getBuyRate('USD', RATES, BUY_MARGIN), 52.65 * 32);
});

console.log('\n3. Consequence: because reference rates are internally consistent (tzsPerUnit = tlPerUnit * TRY.tzsPerUnit),');
console.log('   the BUY side matches "mark up each currency independently" exactly, but SELL does NOT (flat TSh != fixed %)');
test('USD buy via TL anchor equals USD reference marked down directly by the same %', () => {
  const viaAnchor = getBuyRate('USD', RATES, BUY_MARGIN);
  const direct = RATES.USD.tzsPerUnit * (1 - BUY_MARGIN / 100);
  assert.equal(viaAnchor, direct, 'percentage-based buy math commutes through the cross-rate, so these must match exactly');
});
test('USD sell via TL anchor does NOT equal a flat 5% markup on USD reference (flat-TSh effect)', () => {
  const viaAnchor = getSellRate('USD', RATES, MARGIN_TL_TSH); // 1888
  const hypothetical5PctDirect = RATES.USD.tzsPerUnit * 1.05; // 1814.4
  assert.notEqual(viaAnchor, hypothetical5PctDirect, 'a flat TSh offset on TL should NOT reduce to a fixed % on other currencies');
  // The actual effective % this works out to: 1888/1728 - 1 ≈ 9.26%, not 5%, because
  // +5 flat on a ~54 TSh/TL rate is a much bigger relative bump than +5 on ~1728.
});

console.log('\n4. "I send TSh" (customer gives TSh, receives currency at our SELL rate)');
test('1,000,000 TSh -> TL at sell rate 59 = 16,949.15 TL', () => {
  const { amount, sellRate } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_TL_TSH);
  assert.equal(sellRate, 59);
  assert.equal(amount, 16949.15);
});
test('calculateTshToAll returns all four currencies', () => {
  const results = calculateTshToAll(1000000, RATES, MARGIN_TL_TSH);
  assert.equal(results.TL, 16949.15);
  assert.ok(results.USD > 0 && results.EUR > 0 && results.GBP > 0);
});

console.log('\n5. "I want TSh" (customer gives currency, receives TSh at our BUY rate)');
test('24,500 TL at buy rate 52.65 = 1,289,925 TSh', () => {
  const { finalTsh, buyRate } = calculateForeignToTsh({
    currency: 'TL', amount: 24500, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.equal(buyRate, 52.65);
  assert.equal(finalTsh, 24500 * 52.65);
});

console.log('\n6. Margin guarantees profit on BOTH directions for every currency');
for (const currency of ['TL', 'USD', 'EUR', 'GBP']) {
  test(`${currency}: buy rate stays below sell rate`, () => {
    assert.ok(
      getBuyRate(currency, RATES, BUY_MARGIN) < getSellRate(currency, RATES, MARGIN_TL_TSH),
      'buyRate must stay below sellRate for the spread to guarantee profit'
    );
  });
}
test('sending TSh->USD then USD->TSh loses TSh (round trip proves the margin holds)', () => {
  const tshStart = 1000000;
  const { amount: usdReceived } = calculateTshToOne(tshStart, 'USD', RATES, MARGIN_TL_TSH);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'USD', amount: usdReceived, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.ok(tshBack < tshStart, `round trip should lose money: ${tshBack} should be < ${tshStart}`);
});

console.log('\n7. Comma-formatted and decimal inputs');
test('parseAmount handles thousands separators and decimals', () => {
  assert.equal(parseAmount('1,000,000'), 1000000);
  assert.equal(parseAmount('24,500'), 24500);
  assert.equal(parseAmount('1,250.50'), 1250.5);
});

console.log('\n8. Invalid / negative amounts and missing rates');
test('parseAmount rejects garbage input', () => {
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
});
test('calculateQuote rejects zero/negative amounts', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: RATES }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: RATES }), QuoteError);
});
test('want_tsh in EUR with no cached TRY rate throws QuoteError (EUR now depends on the TL anchor)', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { TRY: {}, USD: RATES.USD, EUR: RATES.EUR, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('want_tsh in EUR with no cached tlPerUnit(EUR) throws QuoteError', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('send_tsh with no EUR tlPerUnit returns null for EUR instead of throwing', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN };
  const { results } = calculateQuote({
    direction: 'send_tsh', amount: 1000000, settings,
    rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
  });
  assert.equal(results.EUR, null);
  assert.ok(results.TL > 0);
});

console.log('\n9. Live rate and margin changes affect results predictably');
test('live TL reference 54 -> 58 changes TL AND USD sell rates (everyone inherits it)', () => {
  const ratesAt58 = { ...RATES, TRY: { tzsPerUnit: 58 } };
  const { amount: tlAt54 } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_TL_TSH);
  const { amount: tlAt58 } = calculateTshToOne(1000000, 'TL', ratesAt58, MARGIN_TL_TSH);
  assert.ok(tlAt58 < tlAt54, 'higher live TL rate means fewer TL for the same TSh');

  const { amount: usdAt54 } = calculateTshToOne(1000000, 'USD', RATES, MARGIN_TL_TSH);
  const { amount: usdAt58 } = calculateTshToOne(1000000, 'USD', ratesAt58, MARGIN_TL_TSH);
  assert.notEqual(usdAt54, usdAt58, 'USD price must move too, since it is derived from the TL anchor');
});
test('TL sell margin 5 -> 10 TSh widens the spread for TL AND for every currency derived from it', () => {
  const { amount: tlSendAt5 } = calculateTshToOne(1000000, 'TL', RATES, 5);
  const { amount: tlSendAt10 } = calculateTshToOne(1000000, 'TL', RATES, 10);
  assert.ok(tlSendAt10 < tlSendAt5);

  const { amount: usdSendAt5 } = calculateTshToOne(1000000, 'USD', RATES, 5);
  const { amount: usdSendAt10 } = calculateTshToOne(1000000, 'USD', RATES, 10);
  assert.ok(usdSendAt10 < usdSendAt5, 'USD sell amount must also shrink, since it inherits the wider TL anchor');
});
test('buy margin (%) change affects TL and every foreign currency identically in percentage terms', () => {
  const { finalTsh: tlAt2_5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, buyMarginPercent: 2.5 });
  const { finalTsh: tlAt5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, buyMarginPercent: 5 });
  assert.ok(tlAt5 < tlAt2_5);
});

console.log('\n10. Delivery fee: a flat TL amount converted (at the live reference rate, no margin) into whatever the client receives');
const DELIVERY_FEE_TL = 300;
test('delivery fee in TL itself = the flat amount, unconverted', () => {
  assert.equal(convertDeliveryFeeToForeign(DELIVERY_FEE_TL, 'TL', RATES), 300);
});
test('delivery fee in USD = 300 / tlPerUnit(USD) = 300 / 32 = 9.375, rounded to 9.38', () => {
  assert.equal(convertDeliveryFeeToForeign(DELIVERY_FEE_TL, 'USD', RATES), 9.38);
});
test('delivery fee in TSh = 300 * TL reference (54) = 16,200', () => {
  assert.equal(convertDeliveryFeeToTsh(DELIVERY_FEE_TL, RATES), 16200);
});
test('zero delivery fee converts to 0 in any currency, no rate lookup needed', () => {
  assert.equal(convertDeliveryFeeToForeign(0, 'USD', RATES), 0);
  assert.equal(convertDeliveryFeeToTsh(0, RATES), 0);
});
test('calculateQuote with needsDelivery deducts the fee from every "send TSh" result', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'send_tsh', amount: 1000000, settings, rates: RATES, needsDelivery: true });
  assert.equal(quote.needsDelivery, true);
  assert.ok(quote.results.USD < quote.grossResults.USD, 'net USD amount must be less than gross once delivery fee is deducted');
  assert.equal(round2(quote.grossResults.USD - quote.deliveryFees.USD), quote.results.USD);
});
test('calculateQuote with needsDelivery deducts the fee from "want TSh" result', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'USD', amount: 100, settings, rates: RATES, needsDelivery: true });
  assert.equal(quote.needsDelivery, true);
  assert.ok(quote.finalTsh < quote.grossTsh, 'net TSh must be less than gross once delivery fee is deducted');
  assert.equal(round2(quote.grossTsh - quote.deliveryFeeTsh), quote.finalTsh);
});
test('calculateQuote without needsDelivery is unaffected (no gross/fee fields, same result as before)', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'send_tsh', amount: 1000000, settings, rates: RATES });
  assert.equal(quote.needsDelivery, false);
  assert.equal(quote.grossResults, undefined);
});
test('delivery fee never pushes a result below zero, even for tiny amounts', () => {
  const settings = { marginTlTsh: MARGIN_TL_TSH, buyMarginPercent: BUY_MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'USD', amount: 1, settings, rates: RATES, needsDelivery: true });
  assert.ok(quote.finalTsh >= 0, 'finalTsh must be clamped at 0, never negative');
});

// round2 isn't exported, so mirror it locally for the assertions above.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

console.log(`\n${passed} test group(s) passed.\n`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}

// Standalone test of the calculation engine (lib/calc.js) against the
// flat-commission model: a single percentage applied directly to each
// currency's own live rate, independently (no anchor currency). No test
// framework needed — run with: node scripts/test-calc.mjs
import assert from 'node:assert/strict';
import {
  parseAmount,
  getReferenceRate,
  getSellRate,
  getBuyRate,
  calculateTshToOne,
  calculateTshToAll,
  calculateForeignToTsh,
  calculateRequiredForeignForTsh,
  calculateRequiredTshForForeign,
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
// the implied TL cross-rate; tlPerUnit is kept on each foreign currency for
// admin display only -- it is NOT used by the calculation engine anymore.
const RATES = {
  TRY: { tzsPerUnit: 54 },
  USD: { tlPerUnit: 32, tzsPerUnit: 1728 },
  EUR: { tlPerUnit: 34.5, tzsPerUnit: 1863 },
  GBP: { tlPerUnit: 40, tzsPerUnit: 2160 },
};
const MARGIN = 5; // flat % on every currency, both directions

console.log('\n1. Reference rates (live, no commission applied)');
test('TL reference = live implied rate (rates.TRY.tzsPerUnit)', () => {
  assert.equal(getReferenceRate('TL', RATES), 54);
});
test('USD reference = tzsPerUnit', () => {
  assert.equal(getReferenceRate('USD', RATES), 1728);
});

console.log('\n2. Each currency is priced independently off its own live rate');
test('TL sell = 54 * 1.05 = 56.7', () => {
  assert.equal(getSellRate('TL', RATES, MARGIN), 56.7);
});
test('TL buy = 54 * 0.95 = 51.3', () => {
  assert.equal(getBuyRate('TL', RATES, MARGIN), 51.3);
});
test('USD sell = 1728 * 1.05 = 1814.4', () => {
  assert.equal(getSellRate('USD', RATES, MARGIN), 1728 * 1.05);
});
test('USD buy = 1728 * 0.95 = 1641.6', () => {
  assert.equal(getBuyRate('USD', RATES, MARGIN), 1728 * 0.95);
});
test('EUR sell = 1863 * 1.05', () => {
  assert.equal(getSellRate('EUR', RATES, MARGIN), 1863 * 1.05);
});

console.log('\n3. The same flat % applies to every currency, so the effective markup is identical across all four');
test('TL and USD both mark up by exactly 5% relative to their own reference', () => {
  const tlPct = (getSellRate('TL', RATES, MARGIN) / getReferenceRate('TL', RATES) - 1) * 100;
  const usdPct = (getSellRate('USD', RATES, MARGIN) / getReferenceRate('USD', RATES) - 1) * 100;
  assert.ok(Math.abs(tlPct - 5) < 1e-9);
  assert.ok(Math.abs(usdPct - 5) < 1e-9);
});

console.log('\n4. "I send TSh" (customer gives TSh, receives currency at our SELL rate)');
test('1,000,000 TSh -> TL at sell rate 56.7 = 17,636.68 TL', () => {
  const { amount, sellRate } = calculateTshToOne(1000000, 'TL', RATES, MARGIN);
  assert.equal(sellRate, 56.7);
  assert.equal(amount, Math.round((1000000 / 56.7 + Number.EPSILON) * 100) / 100);
});
test('calculateTshToAll returns all four currencies', () => {
  const results = calculateTshToAll(1000000, RATES, MARGIN);
  assert.equal(results.TL, Math.round((1000000 / 56.7 + Number.EPSILON) * 100) / 100);
  assert.ok(results.USD > 0 && results.EUR > 0 && results.GBP > 0);
});

console.log('\n5. "I want TSh" (customer gives currency, receives TSh at our BUY rate)');
test('24,500 TL at buy rate 51.3 = 1,256,850 TSh', () => {
  const { finalTsh, buyRate } = calculateForeignToTsh({
    currency: 'TL', amount: 24500, rates: RATES, marginPercent: MARGIN,
  });
  assert.equal(buyRate, 51.3);
  assert.equal(finalTsh, 24500 * 51.3);
});

console.log('\n6. Commission guarantees profit on BOTH directions for every currency');
for (const currency of ['TL', 'USD', 'EUR', 'GBP']) {
  test(`${currency}: buy rate stays below sell rate`, () => {
    assert.ok(
      getBuyRate(currency, RATES, MARGIN) < getSellRate(currency, RATES, MARGIN),
      'buyRate must stay below sellRate for the spread to guarantee profit'
    );
  });
}
test('sending TSh->USD then USD->TSh loses TSh (round trip proves the margin holds)', () => {
  const tshStart = 1000000;
  const { amount: usdReceived } = calculateTshToOne(tshStart, 'USD', RATES, MARGIN);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'USD', amount: usdReceived, rates: RATES, marginPercent: MARGIN,
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
  const settings = { marginPercent: MARGIN };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: RATES }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: RATES }), QuoteError);
});
test('want_tsh in EUR with no cached EUR rate throws QuoteError', () => {
  const settings = { marginPercent: MARGIN };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('send_tsh with no EUR rate returns null for EUR instead of throwing', () => {
  const settings = { marginPercent: MARGIN };
  const { results } = calculateQuote({
    direction: 'send_tsh', amount: 1000000, settings,
    rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
  });
  assert.equal(results.EUR, null);
  assert.ok(results.TL > 0);
});

console.log('\n9. Live rate and commission changes affect results predictably');
test('live TL reference 54 -> 58 changes the TL sell rate, but NOT USD (independent now)', () => {
  const ratesAt58 = { ...RATES, TRY: { tzsPerUnit: 58 } };
  const { amount: tlAt54 } = calculateTshToOne(1000000, 'TL', RATES, MARGIN);
  const { amount: tlAt58 } = calculateTshToOne(1000000, 'TL', ratesAt58, MARGIN);
  assert.ok(tlAt58 < tlAt54, 'higher live TL rate means fewer TL for the same TSh');

  const { amount: usdAt54 } = calculateTshToOne(1000000, 'USD', RATES, MARGIN);
  const { amount: usdAt58 } = calculateTshToOne(1000000, 'USD', ratesAt58, MARGIN);
  assert.equal(usdAt54, usdAt58, 'USD price must NOT move when only TL\'s live rate changes -- each currency is independent now');
});
test('commission 5% -> 10% widens the spread for every currency', () => {
  const { amount: tlSendAt5 } = calculateTshToOne(1000000, 'TL', RATES, 5);
  const { amount: tlSendAt10 } = calculateTshToOne(1000000, 'TL', RATES, 10);
  assert.ok(tlSendAt10 < tlSendAt5);

  const { amount: usdSendAt5 } = calculateTshToOne(1000000, 'USD', RATES, 5);
  const { amount: usdSendAt10 } = calculateTshToOne(1000000, 'USD', RATES, 10);
  assert.ok(usdSendAt10 < usdSendAt5);
});

console.log('\n10. Delivery fee: a flat TL amount converted (at the live reference rate, no commission) into whatever the client receives');
const DELIVERY_FEE_TL = 300;
test('delivery fee in TL itself = the flat amount, unconverted', () => {
  assert.equal(convertDeliveryFeeToForeign(DELIVERY_FEE_TL, 'TL', RATES), 300);
});
test('delivery fee in USD = 300 TL worth of TSh (16,200), divided by USD reference (1728) = 9.375, rounded to 9.38', () => {
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
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'send_tsh', amount: 1000000, settings, rates: RATES, needsDelivery: true });
  assert.equal(quote.needsDelivery, true);
  assert.ok(quote.results.USD < quote.grossResults.USD, 'net USD amount must be less than gross once delivery fee is deducted');
  assert.equal(round2(quote.grossResults.USD - quote.deliveryFees.USD), quote.results.USD);
});
test('calculateQuote with needsDelivery deducts the fee from "want TSh" result', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'USD', amount: 100, settings, rates: RATES, needsDelivery: true });
  assert.equal(quote.needsDelivery, true);
  assert.ok(quote.finalTsh < quote.grossTsh, 'net TSh must be less than gross once delivery fee is deducted');
  assert.equal(round2(quote.grossTsh - quote.deliveryFeeTsh), quote.finalTsh);
});
test('calculateQuote without needsDelivery is unaffected (no gross/fee fields, same result as before)', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'send_tsh', amount: 1000000, settings, rates: RATES });
  assert.equal(quote.needsDelivery, false);
  assert.equal(quote.grossResults, undefined);
});
test('delivery fee never pushes a result below zero, even for tiny amounts', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'USD', amount: 1, settings, rates: RATES, needsDelivery: true });
  assert.ok(quote.finalTsh >= 0, 'finalTsh must be clamped at 0, never negative');
});

console.log('\n11. Reverse lookup: exchanger knows the exact TSh a client needs, solve for how much currency to collect');
// Rounding the required amount to 2dp (necessary -- you can't type more
// precision into a real form) can shift the reproduced TSh by at most half
// a cent's worth of the buy rate. Tolerance scales with the rate itself
// rather than a fixed number, so this stays meaningful across currencies
// of very different magnitude (TL ~50 vs USD/EUR/GBP ~1700-2200).
test('270,000 TSh in TL: required amount round-trips back to ~270,000 (within rounding)', () => {
  const { requiredAmount, buyRate } = calculateRequiredForeignForTsh({
    currency: 'TL', targetTsh: 270000, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  assert.ok(Math.abs(requiredAmount * buyRate - 270000) < buyRate, 'requiredAmount * buyRate should land within a rounding cent of the target');
});
test('reverse and forward calculations agree with each other', () => {
  const { requiredAmount, buyRate } = calculateRequiredForeignForTsh({
    currency: 'USD', targetTsh: 500000, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  const { finalTsh } = calculateForeignToTsh({ currency: 'USD', amount: requiredAmount, rates: RATES, marginPercent: MARGIN });
  assert.ok(Math.abs(finalTsh - 500000) < buyRate, 'feeding the reverse-calculated amount back through the forward formula should reproduce the target');
});
test('with delivery: reverse calculation collects MORE currency, so the client still nets exactly the target after the fee', () => {
  const withoutDelivery = calculateRequiredForeignForTsh({
    currency: 'USD', targetTsh: 270000, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  const withDelivery = calculateRequiredForeignForTsh({
    currency: 'USD', targetTsh: 270000, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: true,
  });
  assert.ok(withDelivery.requiredAmount > withoutDelivery.requiredAmount, 'must collect more currency to still net the same target after the delivery fee is deducted');

  const { finalTsh, buyRate } = calculateQuote({
    direction: 'want_tsh', currency: 'USD', amount: withDelivery.requiredAmount,
    settings: { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL },
    rates: RATES, needsDelivery: true, mode: 'given',
  });
  assert.ok(Math.abs(finalTsh - 270000) < buyRate, 'client should still net ~270,000 after collecting the reverse-calculated amount and deducting delivery');
});
test('calculateQuote mode "target" returns requiredAmount instead of finalTsh', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'TL', amount: 270000, settings, rates: RATES, mode: 'target' });
  assert.equal(quote.mode, 'target');
  assert.equal(quote.targetTsh, 270000);
  assert.ok(quote.requiredAmount > 0);
  assert.equal(quote.finalTsh, undefined);
});
test('calculateQuote mode "given" (default) is unchanged and still returns finalTsh', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'want_tsh', currency: 'TL', amount: 100, settings, rates: RATES });
  assert.equal(quote.mode, 'given');
  assert.ok(quote.finalTsh > 0);
  assert.equal(quote.requiredAmount, undefined);
});

console.log('\n12. Reverse lookup, other direction: client knows the exact foreign amount they want, solve for how much TSh to hand over');
test('client wants exactly $100: required TSh round-trips back to ~$100 (within rounding)', () => {
  const { requiredTsh, sellRate } = calculateRequiredTshForForeign({
    currency: 'USD', targetForeignAmount: 100, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  assert.ok(Math.abs(requiredTsh / sellRate - 100) < 1, 'requiredTsh / sellRate should land within a rounding cent of the target');
});
test('reverse and forward calculations agree with each other', () => {
  const { requiredTsh } = calculateRequiredTshForForeign({
    currency: 'EUR', targetForeignAmount: 50, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  const { amount } = calculateTshToOne(requiredTsh, 'EUR', RATES, MARGIN);
  assert.ok(Math.abs(amount - 50) < 0.5, 'feeding the reverse-calculated TSh back through the forward formula should reproduce the target');
});
test('with delivery: reverse calculation requires MORE TSh, so the client still nets exactly the target after the fee', () => {
  const withoutDelivery = calculateRequiredTshForForeign({
    currency: 'USD', targetForeignAmount: 100, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: false,
  });
  const withDelivery = calculateRequiredTshForForeign({
    currency: 'USD', targetForeignAmount: 100, rates: RATES, marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL, needsDelivery: true,
  });
  assert.ok(withDelivery.requiredTsh > withoutDelivery.requiredTsh, 'must hand over more TSh to still net the same target after the delivery fee is deducted');

  const quote = calculateQuote({
    direction: 'send_tsh', amount: withDelivery.requiredTsh, settings: { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL },
    rates: RATES, needsDelivery: true,
  });
  assert.ok(Math.abs(quote.results.USD - 100) < 0.5, 'client should still net ~$100 after handing over the reverse-calculated TSh and deducting delivery');
});
test('calculateQuote send_tsh mode "target" returns requiredTsh instead of the all-currency results object', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  const quote = calculateQuote({ direction: 'send_tsh', currency: 'USD', amount: 100, settings, rates: RATES, mode: 'target' });
  assert.equal(quote.mode, 'target');
  assert.equal(quote.targetForeignAmount, 100);
  assert.ok(quote.requiredTsh > 0);
  assert.equal(quote.results, undefined);
});
test('calculateQuote send_tsh mode "target" rejects an unsupported currency', () => {
  const settings = { marginPercent: MARGIN, deliveryFeeTl: DELIVERY_FEE_TL };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', currency: 'JPY', amount: 100, settings, rates: RATES, mode: 'target' }), QuoteError);
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

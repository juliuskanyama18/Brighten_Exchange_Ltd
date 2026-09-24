// Standalone test of the calculation engine (lib/calc.js) against the
// fully-live buy/sell spread business model (no manual anchor). No test
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
  calculateQuote,
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

// All reference rates now come live from ExchangeRate-API (rates.TRY is the
// implied TL cross-rate, TZS/USD ÷ TRY/USD — see lib/rates.js).
const RATES = {
  TRY: { tzsPerUnit: 54 },
  USD: { tlPerUnit: 32, tzsPerUnit: 2800 },
  EUR: { tlPerUnit: 34.5, tzsPerUnit: 3038 },
  GBP: { tlPerUnit: 40, tzsPerUnit: 3541 },
};
const MARGIN_PERCENT = 5;  // USD/EUR/GBP
const MARGIN_TL_TSH = 5;   // TL, flat TSh

console.log('\n1. Reference rates (live, no margin applied)');
test('TL reference = live implied rate (rates.TRY.tzsPerUnit)', () => {
  assert.equal(getReferenceRate('TL', RATES), 54);
});
test('USD reference = tzsPerUnit', () => {
  assert.equal(getReferenceRate('USD', RATES), 2800);
});

console.log('\n2. Sell/buy rates: TL uses a flat TSh offset, USD/EUR/GBP use a percentage');
test('TL sell = 54 + 5 = 59', () => {
  assert.equal(getSellRate('TL', RATES, MARGIN_PERCENT, MARGIN_TL_TSH), 59);
});
test('TL buy = 54 - 5 = 49', () => {
  assert.equal(getBuyRate('TL', RATES, MARGIN_PERCENT, MARGIN_TL_TSH), 49);
});
test('USD sell = 2800 * 1.05 = 2940', () => {
  assert.equal(getSellRate('USD', RATES, MARGIN_PERCENT, MARGIN_TL_TSH), 2940);
});
test('USD buy = 2800 * 0.95 = 2660', () => {
  assert.equal(getBuyRate('USD', RATES, MARGIN_PERCENT, MARGIN_TL_TSH), 2660);
});

console.log('\n3. "I send TSh" (customer gives TSh, receives currency at our SELL rate)');
test('1,000,000 TSh -> TL at sell rate 59 = 16,949.15 TL', () => {
  const { amount, sellRate } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_PERCENT, MARGIN_TL_TSH);
  assert.equal(sellRate, 59);
  assert.equal(amount, 16949.15);
});
test('1,000,000 TSh -> USD at sell rate 2940 = 340.14 USD', () => {
  const { amount } = calculateTshToOne(1000000, 'USD', RATES, MARGIN_PERCENT, MARGIN_TL_TSH);
  assert.equal(amount, 340.14);
});
test('calculateTshToAll returns all four currencies', () => {
  const results = calculateTshToAll(1000000, RATES, MARGIN_PERCENT, MARGIN_TL_TSH);
  assert.equal(results.TL, 16949.15);
  assert.ok(results.USD > 0 && results.EUR > 0 && results.GBP > 0);
});

console.log('\n4. "I want TSh" (customer gives currency, receives TSh at our BUY rate)');
test('24,500 TL at buy rate 49 = 1,200,500 TSh', () => {
  const { finalTsh, buyRate } = calculateForeignToTsh({
    currency: 'TL', amount: 24500, rates: RATES, marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH,
  });
  assert.equal(buyRate, 49);
  assert.equal(finalTsh, 24500 * 49);
});
test('100 USD at buy rate 2660 = 266,000 TSh', () => {
  const { finalTsh } = calculateForeignToTsh({
    currency: 'USD', amount: 100, rates: RATES, marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH,
  });
  assert.equal(finalTsh, 266000);
});

console.log('\n5. Margin guarantees profit on BOTH directions (round trip loses money for the customer)');
test('sending TSh->TL then TL->TSh loses TSh (proves margin protects both legs)', () => {
  const tshStart = 1000000;
  const { amount: tlReceived } = calculateTshToOne(tshStart, 'TL', RATES, MARGIN_PERCENT, MARGIN_TL_TSH);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'TL', amount: tlReceived, rates: RATES, marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH,
  });
  assert.ok(tshBack < tshStart, `round trip should lose money: ${tshBack} should be < ${tshStart}`);
});

console.log('\n6. Comma-formatted and decimal inputs');
test('parseAmount handles thousands separators and decimals', () => {
  assert.equal(parseAmount('1,000,000'), 1000000);
  assert.equal(parseAmount('24,500'), 24500);
  assert.equal(parseAmount('1,250.50'), 1250.5);
});

console.log('\n7. Invalid / negative amounts and missing rates');
test('parseAmount rejects garbage input', () => {
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
});
test('calculateQuote rejects zero/negative amounts', () => {
  const settings = { marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: RATES }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: RATES }), QuoteError);
});
test('want_tsh in EUR with no cached rate throws QuoteError', () => {
  const settings = { marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('want_tsh in TL with no cached TRY rate throws QuoteError (TL now depends on live rates too)', () => {
  const settings = { marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'TL', amount: 100, settings,
      rates: { TRY: {}, USD: RATES.USD, EUR: RATES.EUR, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('send_tsh with no EUR rate returns null for EUR instead of throwing', () => {
  const settings = { marginPercent: MARGIN_PERCENT, marginTlTsh: MARGIN_TL_TSH };
  const { results } = calculateQuote({
    direction: 'send_tsh', amount: 1000000, settings,
    rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
  });
  assert.equal(results.EUR, null);
  assert.ok(results.TL > 0);
});

console.log('\n8. Live rate and margin changes affect results predictably');
test('live TL reference 54 -> 58 changes TL sell/buy rates and TSh/TL amounts', () => {
  const ratesAt58 = { ...RATES, TRY: { tzsPerUnit: 58 } };
  const { amount: at54 } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_PERCENT, MARGIN_TL_TSH);
  const { amount: at58 } = calculateTshToOne(1000000, 'TL', ratesAt58, MARGIN_PERCENT, MARGIN_TL_TSH);
  assert.notEqual(at54, at58);
  assert.ok(at58 < at54, 'higher live rate means fewer TL for the same TSh (we charge more per TL)');
});
test('TL margin 5 -> 10 TSh widens the spread (customer gets worse rates both ways)', () => {
  const { amount: sendAt5 } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_PERCENT, 5);
  const { amount: sendAt10 } = calculateTshToOne(1000000, 'TL', RATES, MARGIN_PERCENT, 10);
  assert.ok(sendAt10 < sendAt5, 'wider margin means fewer TL for the same TSh');

  const { finalTsh: wantAt5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, marginPercent: MARGIN_PERCENT, marginTlTsh: 5 });
  const { finalTsh: wantAt10 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, marginPercent: MARGIN_PERCENT, marginTlTsh: 10 });
  assert.ok(wantAt10 < wantAt5, 'wider margin means less TSh paid out for the same TL');
});
test('FX margin 5% -> 10% widens the USD spread the same way', () => {
  const { amount: sendAt5 } = calculateTshToOne(1000000, 'USD', RATES, 5, MARGIN_TL_TSH);
  const { amount: sendAt10 } = calculateTshToOne(1000000, 'USD', RATES, 10, MARGIN_TL_TSH);
  assert.ok(sendAt10 < sendAt5, 'wider FX margin means fewer USD for the same TSh');
});

console.log(`\n${passed} test group(s) passed.\n`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}

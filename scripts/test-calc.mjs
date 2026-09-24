// Standalone test of the calculation engine (lib/calc.js) against the
// buy/sell spread business model. No test framework needed —
// run with: node scripts/test-calc.mjs
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

const RATES = {
  USD: { tlPerUnit: 32, tzsPerUnit: 2800 },
  EUR: { tlPerUnit: 34.5, tzsPerUnit: 3038 },
  GBP: { tlPerUnit: 40, tzsPerUnit: 3541 },
};
const ANCHOR = 60; // 1 TL = 60 TSh
const MARGIN = 5;  // 5%

console.log('\n1. Reference rates (no margin applied)');
test('TL reference = anchor', () => {
  assert.equal(getReferenceRate('TL', ANCHOR, RATES), 60);
});
test('USD reference = tzsPerUnit', () => {
  assert.equal(getReferenceRate('USD', ANCHOR, RATES), 2800);
});

console.log('\n2. Sell/buy rates at 5% margin');
test('TL sell = 60 * 1.05 = 63', () => {
  assert.equal(getSellRate('TL', ANCHOR, RATES, MARGIN), 63);
});
test('TL buy = 60 * 0.95 = 57', () => {
  assert.equal(getBuyRate('TL', ANCHOR, RATES, MARGIN), 57);
});
test('USD sell = 2800 * 1.05 = 2940', () => {
  assert.equal(getSellRate('USD', ANCHOR, RATES, MARGIN), 2940);
});
test('USD buy = 2800 * 0.95 = 2660', () => {
  assert.equal(getBuyRate('USD', ANCHOR, RATES, MARGIN), 2660);
});

console.log('\n3. "I send TSh" (customer gives TSh, receives currency at our SELL rate)');
test('1,000,000 TSh -> TL at sell rate 63 = 15,873.02 TL', () => {
  const { amount, sellRate } = calculateTshToOne(1000000, 'TL', ANCHOR, RATES, MARGIN);
  assert.equal(sellRate, 63);
  assert.equal(amount, 15873.02);
});
test('1,000,000 TSh -> USD at sell rate 2940 = 340.14 USD', () => {
  const { amount } = calculateTshToOne(1000000, 'USD', ANCHOR, RATES, MARGIN);
  assert.equal(amount, 340.14);
});
test('calculateTshToAll returns all four currencies', () => {
  const results = calculateTshToAll(1000000, ANCHOR, RATES, MARGIN);
  assert.equal(results.TL, 15873.02);
  assert.ok(results.USD > 0 && results.EUR > 0 && results.GBP > 0);
});

console.log('\n4. "I want TSh" (customer gives currency, receives TSh at our BUY rate)');
test('24,500 TL at buy rate 57 = 1,396,500 TSh (no separate fee/commission)', () => {
  const { finalTsh, buyRate } = calculateForeignToTsh({
    currency: 'TL', amount: 24500, anchorTshPerTl: ANCHOR, rates: RATES, marginPercent: MARGIN,
  });
  assert.equal(buyRate, 57);
  assert.equal(finalTsh, 24500 * 57);
});
test('100 USD at buy rate 2660 = 266,000 TSh', () => {
  const { finalTsh } = calculateForeignToTsh({
    currency: 'USD', amount: 100, anchorTshPerTl: ANCHOR, rates: RATES, marginPercent: MARGIN,
  });
  assert.equal(finalTsh, 266000);
});

console.log('\n5. Margin guarantees profit on BOTH directions (round trip loses money for the customer)');
test('sending TSh->TL then TL->TSh loses TSh (proves margin protects both legs)', () => {
  const tshStart = 1000000;
  const { amount: tlReceived } = calculateTshToOne(tshStart, 'TL', ANCHOR, RATES, MARGIN);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'TL', amount: tlReceived, anchorTshPerTl: ANCHOR, rates: RATES, marginPercent: MARGIN,
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
  const settings = { anchorTshPerTl: ANCHOR, marginPercent: MARGIN };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: RATES }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: RATES }), QuoteError);
});
test('want_tsh in EUR with no cached rate throws QuoteError', () => {
  const settings = { anchorTshPerTl: ANCHOR, marginPercent: MARGIN };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('send_tsh with no EUR rate returns null for EUR instead of throwing', () => {
  const settings = { anchorTshPerTl: ANCHOR, marginPercent: MARGIN };
  const { results } = calculateQuote({
    direction: 'send_tsh', amount: 1000000, settings,
    rates: { USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
  });
  assert.equal(results.EUR, null);
  assert.ok(results.TL > 0);
});

console.log('\n8. Anchor and margin changes affect results predictably');
test('anchor 60 -> 65 changes TL sell/buy rates and TSh/TL amounts', () => {
  const { amount: at60 } = calculateTshToOne(1000000, 'TL', 60, RATES, MARGIN);
  const { amount: at65 } = calculateTshToOne(1000000, 'TL', 65, RATES, MARGIN);
  assert.notEqual(at60, at65);
  assert.ok(at65 < at60, 'higher anchor means fewer TL for the same TSh (we charge more per TL)');
});
test('margin 5% -> 10% widens the spread (customer gets worse rates both ways)', () => {
  const { amount: sendAt5 } = calculateTshToOne(1000000, 'TL', ANCHOR, RATES, 5);
  const { amount: sendAt10 } = calculateTshToOne(1000000, 'TL', ANCHOR, RATES, 10);
  assert.ok(sendAt10 < sendAt5, 'wider margin means fewer TL for the same TSh');

  const { finalTsh: wantAt5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, anchorTshPerTl: ANCHOR, rates: RATES, marginPercent: 5 });
  const { finalTsh: wantAt10 } = calculateForeignToTsh({ currency: 'TL', amount: 100, anchorTshPerTl: ANCHOR, rates: RATES, marginPercent: 10 });
  assert.ok(wantAt10 < wantAt5, 'wider margin means less TSh paid out for the same TL');
});

console.log(`\n${passed} test group(s) passed.\n`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}

// Standalone test of the calculation engine (lib/calc.js) against the
// business's required example calculations. No test framework needed —
// run with: node scripts/test-calc.mjs
import assert from 'node:assert/strict';
import {
  parseAmount,
  calculateTshToTl,
  calculateTshToForeign,
  calculateForeignAmountRequiredTsh,
  calculateTlAmountRequiredTsh,
  calculateTshToAll,
  calculateCommission,
  calculateSendingFee,
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

console.log('\n1. 1,000,000 TSh -> TL');
test('1,000,000 / 60 = 16,666.67 TL', () => {
  const result = calculateTshToTl(parseAmount('1,000,000'), 60);
  assert.equal(result, 16666.67);
});

console.log('\n2. 300 USD -> TSh required (1 USD = 32 TL, anchor 60)');
test('300 * 32 * 60 = 576,000 TSh', () => {
  const result = calculateForeignAmountRequiredTsh(300, 32, 60);
  assert.equal(result, 576000);
});

console.log('\n3. 300 EUR -> TSh required (1 EUR = 34.5 TL, anchor 60)');
test('300 * 34.5 * 60 = 621,000 TSh', () => {
  const result = calculateForeignAmountRequiredTsh(300, 34.5, 60);
  assert.equal(result, 621000);
});

console.log('\n4. 300 GBP -> TSh required (1 GBP = 40 TL, anchor 60)');
test('300 * 40 * 60 = 720,000 TSh', () => {
  const result = calculateForeignAmountRequiredTsh(300, 40, 60);
  assert.equal(result, 720000);
});

console.log('\n5. 100 USD -> TSh received (1 USD = 2,800 TSh, commission 100 TL, flat fee 10,000)');
test('gross 280,000; commission 6,000; fee 10,000; final 264,000', () => {
  const { grossTsh, commissionTsh, sendingFeeTsh, finalTsh } = calculateForeignToTsh({
    currency: 'USD',
    amount: 100,
    anchorTshPerTl: 60,
    foreignToTzsRate: 2800,
    commissionTl: 100,
    sendingFee: { type: 'flat', value: 10000 },
  });
  assert.equal(grossTsh, 280000);
  assert.equal(commissionTsh, 6000);
  assert.equal(sendingFeeTsh, 10000);
  assert.equal(finalTsh, 264000);
});

console.log('\n6. TL -> TSh (both directions)');
test('Direction A: 100 TL requires 6,000 TSh', () => {
  assert.equal(calculateTlAmountRequiredTsh(100, 60), 6000);
});
test('Direction B: customer gives 100 TL, gross TSh before fees = 6,000', () => {
  const { grossTsh } = calculateForeignToTsh({
    currency: 'TL',
    amount: 100,
    anchorTshPerTl: 60,
    foreignToTzsRate: null,
    commissionTl: 0,
    sendingFee: { type: 'flat', value: 0 },
  });
  assert.equal(grossTsh, 6000);
});

console.log('\n7. Decimal amounts');
test('1,250.50 TSh / 60 = 20.84 TL', () => {
  assert.equal(calculateTshToTl(1250.5, 60), 20.84);
});

console.log('\n8. Comma-formatted inputs');
test('parseAmount handles thousands separators and decimals', () => {
  assert.equal(parseAmount('1,000,000'), 1000000);
  assert.equal(parseAmount('10,000'), 10000);
  assert.equal(parseAmount('300'), 300);
  assert.equal(parseAmount('1,250.50'), 1250.5);
});

console.log('\n9. Missing rates');
test('want_tsh in EUR with no cached rate throws QuoteError', () => {
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh',
      currency: 'EUR',
      amount: 100,
      settings: { anchorTshPerTl: 60, commissionTl: 100, sendingFee: { type: 'flat', value: 10000 } },
      rates: { USD: { tlPerUnit: 32, tzsPerUnit: 2800 }, EUR: { tlPerUnit: null, tzsPerUnit: null }, GBP: {} },
    });
  }, QuoteError);
});
test('send_tsh with no EUR rate returns null for EUR instead of throwing', () => {
  const { results } = calculateQuote({
    direction: 'send_tsh',
    amount: 1000000,
    settings: { anchorTshPerTl: 60 },
    rates: { USD: { tlPerUnit: 32 }, EUR: { tlPerUnit: null }, GBP: { tlPerUnit: 40 } },
  });
  assert.equal(results.EUR, null);
  assert.equal(results.TL, 16666.67);
});

console.log('\n10. Invalid / negative amounts');
test('parseAmount rejects garbage input', () => {
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('')));
});
test('calculateQuote rejects zero/negative amounts', () => {
  const settings = { anchorTshPerTl: 60, commissionTl: 100, sendingFee: { type: 'flat', value: 10000 } };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: {} }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: {} }), QuoteError);
});

console.log('\n11. Anchor changes affect TL, foreign, and commission — but not the cached API rates');
test('anchor 60 -> 65 changes TSh/TL, TSh/USD, and commissionTsh identically', () => {
  const rates = { USD: { tlPerUnit: 32, tzsPerUnit: 2800 }, EUR: {}, GBP: {} };

  const at60 = calculateTshToAll(1000000, 60, rates);
  const at65 = calculateTshToAll(1000000, 65, rates);
  assert.equal(at60.TL, 16666.67);
  assert.equal(at65.TL, 15384.62);
  assert.notEqual(at60.USD, at65.USD);

  assert.equal(calculateCommission(100, 60), 6000);
  assert.equal(calculateCommission(100, 65), 6500);

  // The external rate itself (TL per USD) is untouched by the anchor change.
  assert.equal(rates.USD.tlPerUnit, 32);
});

console.log('\n12. Commission changes');
test('commissionTl 100 -> 150 at anchor 60', () => {
  assert.equal(calculateCommission(100, 60), 6000);
  assert.equal(calculateCommission(150, 60), 9000);
});

console.log('\n13. Sending fee changes (flat vs percentage)');
test('flat fee ignores gross amount; percentage fee scales with it', () => {
  assert.equal(calculateSendingFee(280000, { type: 'flat', value: 10000 }), 10000);
  assert.equal(calculateSendingFee(280000, { type: 'percentage', value: 5 }), 14000);
});

console.log(`\n${passed} test group(s) passed.\n`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}

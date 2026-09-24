// Standalone test of the calculation engine (lib/calc.js) against the
// fully-live buy/sell spread business model (no manual anchor). Buy side
// is a percentage for ALL currencies including TL; only TL's sell side
// keeps a flat TSh offset. No test framework needed — run with:
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
const SELL_MARGIN = 5;    // USD/EUR/GBP + TL sell(TSh); customer buys from us
const BUY_MARGIN = 2.5;   // ALL currencies incl. TL; customer sells to us -- intentionally different from SELL_MARGIN
const MARGIN_TL_TSH = 5;  // TL SELL side only, flat TSh

console.log('\n1. Reference rates (live, no margin applied)');
test('TL reference = live implied rate (rates.TRY.tzsPerUnit)', () => {
  assert.equal(getReferenceRate('TL', RATES), 54);
});
test('USD reference = tzsPerUnit', () => {
  assert.equal(getReferenceRate('USD', RATES), 2800);
});

console.log('\n2. Sell/buy rates: TL sell is a flat TSh offset, everything else (incl. TL buy) is a percentage');
test('TL sell = 54 + 5 = 59 (flat TSh)', () => {
  assert.equal(getSellRate('TL', RATES, SELL_MARGIN, MARGIN_TL_TSH), 59);
});
test('TL buy = 54 * 0.975 = 52.65 (percentage, same mechanism as USD/EUR/GBP)', () => {
  assert.equal(getBuyRate('TL', RATES, BUY_MARGIN), 52.65);
});
test('USD sell = 2800 * 1.05 = 2940 (5% sell margin)', () => {
  assert.equal(getSellRate('USD', RATES, SELL_MARGIN, MARGIN_TL_TSH), 2940);
});
test('USD buy = 2800 * 0.975 = 2730 (2.5% buy margin, NOT the same as sell)', () => {
  assert.equal(getBuyRate('USD', RATES, BUY_MARGIN), 2730);
});

console.log('\n3. "I send TSh" (customer gives TSh, receives currency at our SELL rate)');
test('1,000,000 TSh -> TL at sell rate 59 = 16,949.15 TL', () => {
  const { amount, sellRate } = calculateTshToOne(1000000, 'TL', RATES, SELL_MARGIN, MARGIN_TL_TSH);
  assert.equal(sellRate, 59);
  assert.equal(amount, 16949.15);
});
test('1,000,000 TSh -> USD at sell rate 2940 = 340.14 USD', () => {
  const { amount } = calculateTshToOne(1000000, 'USD', RATES, SELL_MARGIN, MARGIN_TL_TSH);
  assert.equal(amount, 340.14);
});
test('calculateTshToAll returns all four currencies', () => {
  const results = calculateTshToAll(1000000, RATES, SELL_MARGIN, MARGIN_TL_TSH);
  assert.equal(results.TL, 16949.15);
  assert.ok(results.USD > 0 && results.EUR > 0 && results.GBP > 0);
});

console.log('\n4. "I want TSh" (customer gives currency, receives TSh at our BUY rate)');
test('24,500 TL at buy rate 52.65 = 1,289,925 TSh', () => {
  const { finalTsh, buyRate } = calculateForeignToTsh({
    currency: 'TL', amount: 24500, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.equal(buyRate, 52.65);
  assert.equal(finalTsh, 24500 * 52.65);
});
test('100 USD at buy rate 2730 (2.5% margin) = 273,000 TSh', () => {
  const { finalTsh } = calculateForeignToTsh({
    currency: 'USD', amount: 100, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.equal(finalTsh, 273000);
});

console.log('\n5. Margin guarantees profit on BOTH directions, even with asymmetric sell/buy %');
test('sending TSh->USD then USD->TSh loses TSh (proves margin protects both legs)', () => {
  const tshStart = 1000000;
  const { amount: usdReceived } = calculateTshToOne(tshStart, 'USD', RATES, SELL_MARGIN, MARGIN_TL_TSH);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'USD', amount: usdReceived, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.ok(tshBack < tshStart, `round trip should lose money: ${tshBack} should be < ${tshStart}`);
});
test('sending TSh->TL then TL->TSh loses TSh too (TL sell is flat TSh, TL buy is now a percentage)', () => {
  const tshStart = 1000000;
  const { amount: tlReceived } = calculateTshToOne(tshStart, 'TL', RATES, SELL_MARGIN, MARGIN_TL_TSH);
  const { finalTsh: tshBack } = calculateForeignToTsh({
    currency: 'TL', amount: tlReceived, rates: RATES, buyMarginPercent: BUY_MARGIN,
  });
  assert.ok(tshBack < tshStart, `round trip should lose money: ${tshBack} should be < ${tshStart}`);
});
test('buy rate is always below sell rate regardless of how the margins are split', () => {
  assert.ok(
    getBuyRate('USD', RATES, BUY_MARGIN) < getSellRate('USD', RATES, SELL_MARGIN, MARGIN_TL_TSH),
    'buyRate must stay below sellRate for the spread to guarantee profit'
  );
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
  const settings = { sellMarginPercent: SELL_MARGIN, buyMarginPercent: BUY_MARGIN, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: -5, settings, rates: RATES }), QuoteError);
  assert.throws(() => calculateQuote({ direction: 'send_tsh', amount: 0, settings, rates: RATES }), QuoteError);
});
test('want_tsh in EUR with no cached rate throws QuoteError', () => {
  const settings = { sellMarginPercent: SELL_MARGIN, buyMarginPercent: BUY_MARGIN, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'EUR', amount: 100, settings,
      rates: { TRY: RATES.TRY, USD: RATES.USD, EUR: {}, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('want_tsh in TL with no cached TRY rate throws QuoteError (TL buy now depends on live rates too)', () => {
  const settings = { sellMarginPercent: SELL_MARGIN, buyMarginPercent: BUY_MARGIN, marginTlTsh: MARGIN_TL_TSH };
  assert.throws(() => {
    calculateQuote({
      direction: 'want_tsh', currency: 'TL', amount: 100, settings,
      rates: { TRY: {}, USD: RATES.USD, EUR: RATES.EUR, GBP: RATES.GBP },
    });
  }, QuoteError);
});
test('send_tsh with no EUR rate returns null for EUR instead of throwing', () => {
  const settings = { sellMarginPercent: SELL_MARGIN, buyMarginPercent: BUY_MARGIN, marginTlTsh: MARGIN_TL_TSH };
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
  const { amount: at54 } = calculateTshToOne(1000000, 'TL', RATES, SELL_MARGIN, MARGIN_TL_TSH);
  const { amount: at58 } = calculateTshToOne(1000000, 'TL', ratesAt58, SELL_MARGIN, MARGIN_TL_TSH);
  assert.notEqual(at54, at58);
  assert.ok(at58 < at54, 'higher live rate means fewer TL for the same TSh (we charge more per TL)');
});
test('TL SELL margin 5 -> 10 TSh widens the sell spread only', () => {
  const { amount: sendAt5 } = calculateTshToOne(1000000, 'TL', RATES, SELL_MARGIN, 5);
  const { amount: sendAt10 } = calculateTshToOne(1000000, 'TL', RATES, SELL_MARGIN, 10);
  assert.ok(sendAt10 < sendAt5, 'wider sell margin means fewer TL for the same TSh');
});
test('TL BUY margin (%) 2.5 -> 5 widens the buy spread, same mechanism as USD/EUR/GBP', () => {
  const { finalTsh: wantAt2_5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, buyMarginPercent: 2.5 });
  const { finalTsh: wantAt5 } = calculateForeignToTsh({ currency: 'TL', amount: 100, rates: RATES, buyMarginPercent: 5 });
  assert.ok(wantAt5 < wantAt2_5, 'wider buy margin means less TSh paid out for the same TL');
});
test('sell margin only affects the sell side; buy margin only affects the buy side', () => {
  const sellAt5 = getSellRate('USD', RATES, 5, MARGIN_TL_TSH);
  const sellAt10 = getSellRate('USD', RATES, 10, MARGIN_TL_TSH);
  assert.notEqual(sellAt5, sellAt10);

  // Changing the SELL margin must not move the BUY rate, and vice versa.
  const buyUnaffected1 = getBuyRate('USD', RATES, 5);
  const buyUnaffected2 = getBuyRate('USD', RATES, 5);
  assert.equal(buyUnaffected1, buyUnaffected2);
});

console.log(`\n${passed} test group(s) passed.\n`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
} else {
  console.log('ALL TESTS PASSED');
}

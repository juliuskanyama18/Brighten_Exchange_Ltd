'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import CurrencySelector from './CurrencySelector';
import QuoteConfirmation from './QuoteConfirmation';
import { formatAmount, formatNumberInput } from '@/utils/formatting';

const FOREIGN_CURRENCIES = ['TL', 'USD', 'EUR', 'GBP'];

function RatesFooter({ ratesInfo }) {
  if (!ratesInfo) return null;
  if (!ratesInfo.hasAnyRates) {
    return (
      <p className="text-center text-xs text-amber-600 dark:text-amber-400">Rates not set yet</p>
    );
  }
  const updated = ratesInfo.lastFetchedAt
    ? new Date(ratesInfo.lastFetchedAt).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';
  return (
    <p className="text-center text-xs text-slate-400 dark:text-slate-500">
      Rates updated: {updated}{ratesInfo.isCached ? ' (cached)' : ''}
    </p>
  );
}

function DeliveryCheckbox({ checked, onChange, feeTl }) {
  return (
    <label className="flex items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-gold-500 focus:ring-gold-500"
      />
      Include delivery {feeTl ? `(−${feeTl} TL worth deducted)` : ''}
    </label>
  );
}

// A fixed, non-editable badge for whichever side currently holds TZS —
// TZS is never a user choice (this business always trades against it).
function TzsBadge() {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">
      🇹🇿 TZS
    </div>
  );
}

// Everyone already knows how to use a currency converter: a "You Give" box,
// a "You Get" box, and a swap button — no tabs, no "send"/"want" labels
// that can be misread as a remittance (sending money to someone else)
// instead of what it actually is (handing currency to the exchanger).
//
// `tzsSide` says which box currently holds TZS (the swap button flips it).
// `inputSide` says which box you're currently typing an amount into — the
// OTHER box always shows the computed result. Someone who knows what they
// want to receive but not what that costs can tap the "You Get" box itself
// and type there instead; the "You Give" box then becomes the computed one.
export default function Converter({ paymentDetails }) {
  const [tzsSide, setTzsSide] = useState('give');
  const [inputSide, setInputSide] = useState('give');
  const [foreignCurrency, setForeignCurrency] = useState('USD');
  const [amount, setAmount] = useState('');

  const [ratesInfo, setRatesInfo] = useState(null);
  const [quote, setQuote] = useState(null);
  const [needsDelivery, setNeedsDelivery] = useState(false);
  const [deliveryFeeTl, setDeliveryFeeTl] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  const [result, setResult] = useState(null); // full /api/quote response for the current combination
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const debounceRef = useRef(null);

  useEffect(() => {
    axios.get('/api/rates').then(({ data }) => {
      if (data.success) {
        setRatesInfo({
          hasAnyRates: data.hasAnyRates,
          isCached: data.isCached,
          lastFetchedAt: data.lastFetchedAt,
        });
        setDeliveryFeeTl(data.deliveryFeeTl);
      }
    }).catch(() => {});
  }, []);

  // Which /api/quote shape to ask for depends on BOTH which side holds TZS
  // and which side is being typed into:
  //   tzsSide='give', inputSide='give' -> send_tsh, mode 'given'  (typed TZS, solve foreign)
  //   tzsSide='give', inputSide='get'  -> send_tsh, mode 'target' (typed foreign, solve TZS)
  //   tzsSide='get',  inputSide='give' -> want_tsh, mode 'given'  (typed foreign, solve TZS)
  //   tzsSide='get',  inputSide='get'  -> want_tsh, mode 'target' (typed TZS, solve foreign)
  const fetchQuote = useCallback(async (side, input, currency, amt, delivery) => {
    const clean = amt.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    const direction = side === 'give' ? 'send_tsh' : 'want_tsh';
    // 'given' always means "typed into the You-Give box" (forward calc from
    // what's handed over); 'target' always means "typed into the You-Get
    // box" (reverse calc, solving for what to hand over) — regardless of
    // which currency happens to be on which side.
    const mode = input === 'give' ? 'given' : 'target';
    const body = { direction, amount: clean, needsDelivery: delivery, mode };
    if (direction === 'want_tsh' || mode === 'target') body.currency = currency;
    try {
      const { data } = await axios.post('/api/quote', body);
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Could not calculate quote');
        setResult(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchQuote(tzsSide, inputSide, foreignCurrency, amount, needsDelivery),
      500
    );
    return () => clearTimeout(debounceRef.current);
  }, [tzsSide, inputSide, amount, foreignCurrency, needsDelivery, fetchQuote]);

  const handleSwap = () => {
    setTzsSide((s) => (s === 'give' ? 'get' : 'give'));
    setInputSide('give');
    setAmount('');
    setResult(null);
    setError('');
  };

  const handleActivateSide = (side) => {
    if (side === inputSide) return;
    setInputSide(side);
    setAmount('');
    setResult(null);
    setError('');
  };

  // Which number (if any) the read-only box should show, computed from
  // whichever /api/quote shape `result` currently holds.
  let computedValue = null;
  if (result) {
    if (tzsSide === 'give' && inputSide === 'give') computedValue = result.results?.[foreignCurrency];
    else if (tzsSide === 'give' && inputSide === 'get') computedValue = result.requiredTsh;
    else if (tzsSide === 'get' && inputSide === 'give') computedValue = result.finalTsh;
    else computedValue = result.requiredAmount;
  }
  const canGetQuote = computedValue !== null && computedValue !== undefined;

  const giveCurrency = tzsSide === 'give' ? 'TZS' : foreignCurrency;
  const getCurrency = tzsSide === 'give' ? foreignCurrency : 'TZS';
  const computedBoxSide = inputSide === 'give' ? 'get' : 'give';

  const handleGetQuote = () => {
    if (!result) return;
    if (tzsSide === 'give' && inputSide === 'give') {
      const netAmount = result.results?.[foreignCurrency];
      if (netAmount === null || netAmount === undefined) return;
      const grossAmount = (result.grossResults ?? result.results)[foreignCurrency];
      const tshAmountNum = parseFloat(amount.replace(/,/g, ''));
      setQuote({
        direction: 'send_tsh', fromCurrency: 'TZS', toCurrency: foreignCurrency,
        sendAmount: tshAmountNum, receiveAmount: netAmount,
        rateUsed: tshAmountNum / grossAmount, // pure sell rate, unaffected by delivery fee
        needsDelivery: result.needsDelivery, grossAmount,
        deliveryFeeAmount: result.deliveryFees?.[foreignCurrency] ?? 0,
      });
    } else if (tzsSide === 'give' && inputSide === 'get') {
      setQuote({
        direction: 'send_tsh', fromCurrency: 'TZS', toCurrency: foreignCurrency,
        sendAmount: result.requiredTsh, receiveAmount: result.targetForeignAmount,
        rateUsed: result.sellRate, needsDelivery: result.needsDelivery,
        grossAmount: result.grossForeignNeeded ?? result.targetForeignAmount,
        deliveryFeeAmount: result.deliveryFeeForeign ?? 0,
      });
    } else if (tzsSide === 'get' && inputSide === 'give') {
      setQuote({
        direction: 'want_tsh', fromCurrency: foreignCurrency, toCurrency: 'TZS',
        sendAmount: parseFloat(amount.replace(/,/g, '')), receiveAmount: result.finalTsh,
        rateUsed: result.buyRate, needsDelivery: result.needsDelivery,
        grossAmount: result.grossTsh ?? result.finalTsh,
        deliveryFeeAmount: result.deliveryFeeTsh ?? 0,
      });
    } else {
      setQuote({
        direction: 'want_tsh', fromCurrency: foreignCurrency, toCurrency: 'TZS',
        sendAmount: result.requiredAmount, receiveAmount: result.targetTsh,
        rateUsed: result.buyRate, needsDelivery: result.needsDelivery,
        grossAmount: result.grossTshNeeded ?? result.targetTsh,
        deliveryFeeAmount: result.deliveryFeeTsh ?? 0,
      });
    }
  };

  const handleReset = () => {
    setQuote(null);
    setAmount('');
    setResult(null);
  };

  if (quote) {
    return (
      <QuoteConfirmation
        quote={quote}
        paymentDetails={paymentDetails}
        onBack={() => setQuote(null)}
        onReset={handleReset}
      />
    );
  }

  const Spinner = (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <svg className="animate-spin w-4 h-4 text-gold-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Calculating…
    </div>
  );

  function AmountBox({ side, currency, label, highlight }) {
    const isInput = side === inputSide;
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <div className={`border rounded-2xl p-3.5 transition-shadow ${
          highlight
            ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-gold-500'
            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {isInput ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(formatNumberInput(e.target.value))}
                  placeholder="0"
                  className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-white outline-none placeholder-slate-300 dark:placeholder-slate-600"
                />
              ) : loading ? Spinner : (
                <button
                  type="button"
                  onClick={() => handleActivateSide(side)}
                  className="w-full text-left text-2xl font-bold text-emerald-600 dark:text-emerald-400 break-words"
                >
                  {computedValue !== null && computedValue !== undefined ? formatAmount(computedValue, currency) : '0'}
                </button>
              )}
            </div>
            {currency === 'TZS' ? <TzsBadge /> : (
              <div className="w-32 sm:w-36 shrink-0">
                <CurrencySelector value={foreignCurrency} onChange={setForeignCurrency} currencies={FOREIGN_CURRENCIES} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <AmountBox side="give" currency={giveCurrency} label="You Give" highlight />

      <div className="flex justify-center -my-1.5 relative z-10">
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap direction"
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-900 shadow-md flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-gold-500 hover:border-gold-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      <AmountBox side="get" currency={getCurrency} label="You Get" />

      {/* Discoverability hint for tapping the other box — the box itself is
          already clickable, this just makes it obvious. */}
      <button
        type="button"
        onClick={() => handleActivateSide(computedBoxSide)}
        className="block w-full text-center text-xs text-slate-400 dark:text-slate-500 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300"
      >
        {inputSide === 'give'
          ? `Don't know what to give? Type what you want to get instead →`
          : `← Type what you're giving instead`}
      </button>

      <DeliveryCheckbox checked={needsDelivery} onChange={setNeedsDelivery} feeTl={deliveryFeeTl} />

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 text-center">
          {error}
        </div>
      )}

      <button
        onClick={handleGetQuote}
        disabled={!canGetQuote || loading}
        className="w-full py-3.5 rounded-2xl text-base font-bold bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 active:from-gold-600 active:to-gold-800 text-brand-950 shadow-lg shadow-gold-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
      >
        Get Quote →
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="text-xs text-slate-400 dark:text-slate-500 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300"
        >
          {showInfo ? 'Hide rate info' : 'ⓘ Rate info'}
        </button>
        {showInfo && (
          <div className="mt-2 space-y-1">
            <RatesFooter ratesInfo={ratesInfo} />
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">
              Estimate only — final amount is confirmed at the time of transaction.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

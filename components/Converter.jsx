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
// `tzsSide` says which box currently holds TZS; the swap button flips it.
export default function Converter({ paymentDetails }) {
  const [tzsSide, setTzsSide] = useState('give'); // 'give' = you hand over TZS, 'get' = you hand over foreign currency
  const [foreignCurrency, setForeignCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  // Only meaningful when tzsSide === 'get': false = you type the foreign
  // amount you're handing over; true = you type the exact TZS you need,
  // and we solve for how much foreign currency to collect instead.
  const [targetMode, setTargetMode] = useState(false);

  const [ratesInfo, setRatesInfo] = useState(null);
  const [quote, setQuote] = useState(null);
  const [needsDelivery, setNeedsDelivery] = useState(false);
  const [deliveryFeeTl, setDeliveryFeeTl] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  const [sendQuote, setSendQuote] = useState(null); // tzsSide 'give': full /api/quote response (all 4 currencies)
  const [wantResult, setWantResult] = useState(null); // tzsSide 'get': full /api/quote response
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

  const fetchSendQuote = useCallback(async (amt, delivery) => {
    const clean = amt.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setSendQuote(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'send_tsh', amount: clean, needsDelivery: delivery });
      if (data.success) {
        setSendQuote(data);
      } else {
        setError(data.error || 'Could not calculate quote');
        setSendQuote(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setSendQuote(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWantQuote = useCallback(async (currency, amt, delivery, mode) => {
    const clean = amt.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setWantResult(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'want_tsh', currency, amount: clean, needsDelivery: delivery, mode });
      if (data.success) {
        setWantResult(data);
      } else {
        setError(data.error || 'Could not calculate quote');
        setWantResult(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setWantResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (tzsSide === 'give') {
      debounceRef.current = setTimeout(() => fetchSendQuote(amount, needsDelivery), 500);
    } else {
      debounceRef.current = setTimeout(() => fetchWantQuote(foreignCurrency, amount, needsDelivery, targetMode ? 'target' : 'given'), 500);
    }
    return () => clearTimeout(debounceRef.current);
  }, [tzsSide, amount, foreignCurrency, needsDelivery, targetMode, fetchSendQuote, fetchWantQuote]);

  const handleSwap = () => {
    setTzsSide((s) => (s === 'give' ? 'get' : 'give'));
    setTargetMode(false);
    setAmount('');
    setSendQuote(null);
    setWantResult(null);
    setError('');
  };

  const handleToggleTargetMode = () => {
    setTargetMode((v) => !v);
    setAmount('');
    setWantResult(null);
    setError('');
  };

  const handleGetQuote = () => {
    if (tzsSide === 'give') {
      const netAmount = sendQuote?.results?.[foreignCurrency];
      if (netAmount === null || netAmount === undefined) return;
      const grossAmount = (sendQuote.grossResults ?? sendQuote.results)[foreignCurrency];
      const tshAmountNum = parseFloat(amount.replace(/,/g, ''));
      setQuote({
        direction: 'send_tsh',
        fromCurrency: 'TZS',
        toCurrency: foreignCurrency,
        sendAmount: tshAmountNum,
        receiveAmount: netAmount,
        rateUsed: tshAmountNum / grossAmount, // pure sell rate, unaffected by delivery fee
        needsDelivery: sendQuote.needsDelivery,
        grossAmount,
        deliveryFeeAmount: sendQuote.deliveryFees?.[foreignCurrency] ?? 0,
      });
      return;
    }

    if (!wantResult) return;
    if (wantResult.mode === 'target') {
      setQuote({
        direction: 'want_tsh',
        fromCurrency: foreignCurrency,
        toCurrency: 'TZS',
        sendAmount: wantResult.requiredAmount,
        receiveAmount: wantResult.targetTsh,
        rateUsed: wantResult.buyRate,
        needsDelivery: wantResult.needsDelivery,
        grossAmount: wantResult.grossTshNeeded ?? wantResult.targetTsh,
        deliveryFeeAmount: wantResult.deliveryFeeTsh ?? 0,
      });
      return;
    }
    setQuote({
      direction: 'want_tsh',
      fromCurrency: foreignCurrency,
      toCurrency: 'TZS',
      sendAmount: parseFloat(amount.replace(/,/g, '')),
      receiveAmount: wantResult.finalTsh,
      rateUsed: wantResult.buyRate,
      needsDelivery: wantResult.needsDelivery,
      grossAmount: wantResult.grossTsh ?? wantResult.finalTsh,
      deliveryFeeAmount: wantResult.deliveryFeeTsh ?? 0,
    });
  };

  const handleReset = () => {
    setQuote(null);
    setAmount('');
    setSendQuote(null);
    setWantResult(null);
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

  // Which box is the editable input right now, and what computed value (if
  // any) the other box should display.
  const inputSide = tzsSide === 'get' && targetMode ? 'get' : 'give';
  let computedForeign = null; // shown in the foreign box when it's read-only
  let computedTsh = null;     // shown in the TZS box when it's read-only
  let canGetQuote = false;

  if (tzsSide === 'give') {
    computedForeign = sendQuote?.results?.[foreignCurrency] ?? null;
    canGetQuote = computedForeign !== null && computedForeign !== undefined;
  } else if (!targetMode) {
    computedTsh = wantResult?.mode === 'given' ? wantResult.finalTsh : null;
    canGetQuote = computedTsh !== null && computedTsh !== undefined;
  } else {
    computedForeign = wantResult?.mode === 'target' ? wantResult.requiredAmount : null;
    canGetQuote = computedForeign !== null && computedForeign !== undefined;
  }

  const giveCurrency = tzsSide === 'give' ? 'TZS' : foreignCurrency;
  const getCurrency = tzsSide === 'give' ? foreignCurrency : 'TZS';

  const Spinner = (
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <svg className="animate-spin w-4 h-4 text-gold-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Calculating…
    </div>
  );

  return (
    <div className="space-y-3.5">
      {/* You Give */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          You Give
        </label>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 focus-within:ring-2 focus-within:ring-gold-500 transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {inputSide === 'give' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(formatNumberInput(e.target.value))}
                  placeholder="0"
                  className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-white outline-none placeholder-slate-300 dark:placeholder-slate-600"
                />
              ) : loading ? Spinner : (
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 break-words">
                  {computedForeign !== null ? formatAmount(computedForeign, foreignCurrency) : '0'}
                </p>
              )}
            </div>
            {giveCurrency === 'TZS' ? <TzsBadge /> : (
              <div className="w-32 sm:w-36 shrink-0">
                <CurrencySelector value={foreignCurrency} onChange={setForeignCurrency} currencies={FOREIGN_CURRENCIES} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Swap */}
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

      {/* You Get */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          You Get
        </label>
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 focus-within:ring-2 focus-within:ring-gold-500 transition-shadow">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {inputSide === 'get' ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(formatNumberInput(e.target.value))}
                  placeholder="0"
                  className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-white outline-none placeholder-slate-300 dark:placeholder-slate-600"
                />
              ) : loading ? Spinner : (
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 break-words">
                  {getCurrency === 'TZS'
                    ? (computedTsh !== null ? formatAmount(computedTsh, 'TZS') : '0')
                    : (computedForeign !== null ? formatAmount(computedForeign, foreignCurrency) : '0')}
                </p>
              )}
            </div>
            {getCurrency === 'TZS' ? <TzsBadge /> : (
              <div className="w-32 sm:w-36 shrink-0">
                <CurrencySelector value={foreignCurrency} onChange={setForeignCurrency} currencies={FOREIGN_CURRENCIES} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exact-amount toggle — only relevant when you're handing over foreign
          currency and want to specify the TZS side instead (e.g. the
          exchanger already knows the client needs exactly 270,000 TZS). */}
      {tzsSide === 'get' && (
        <button
          type="button"
          onClick={handleToggleTargetMode}
          className="block w-full text-center text-xs text-slate-400 dark:text-slate-500 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300"
        >
          {targetMode ? '← Type the amount you\'re giving instead' : 'Need to receive an exact TZS amount instead? →'}
        </button>
      )}

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

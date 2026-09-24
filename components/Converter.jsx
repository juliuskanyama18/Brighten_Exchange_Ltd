'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import CurrencySelector from './CurrencySelector';
import QuoteConfirmation from './QuoteConfirmation';
import { formatAmount, currencyFlag, currencyDisplayLabel, formatNumberInput } from '@/utils/formatting';

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

// This interface is used by BOTH the client (self-service) and the exchanger
// (operating it on the client's behalf during an in-person transaction) — so
// labels always name the role ("Client Sends" / "Exchanger Gives") instead of
// "I"/"You", which would mean different things depending on who's typing.
function DeliveryCheckbox({ checked, onChange, feeTl }) {
  return (
    <label className="flex items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-gold-500 focus:ring-gold-500"
      />
      Client needs delivery {feeTl ? `(−${feeTl} TL worth deducted)` : ''}
    </label>
  );
}

export default function Converter({ paymentDetails }) {
  const [tab, setTab] = useState('send'); // 'send' = client sends TSh, 'want' = client wants TSh
  const [ratesInfo, setRatesInfo] = useState(null);
  const [quote, setQuote] = useState(null);
  const [needsDelivery, setNeedsDelivery] = useState(false);
  const [deliveryFeeTl, setDeliveryFeeTl] = useState(null);

  // ---- Tab 1: Client sends TSh ----
  const [tshAmount, setTshAmount] = useState('');
  const [sendQuote, setSendQuote] = useState(null); // full /api/quote response
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');

  // ---- Tab 2: Client wants TSh ----
  const [wantCurrency, setWantCurrency] = useState('USD');
  const [wantAmount, setWantAmount] = useState('');
  const [wantResult, setWantResult] = useState(null); // full /api/quote response
  const [wantLoading, setWantLoading] = useState(false);
  const [wantError, setWantError] = useState('');

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

  const fetchSendQuote = useCallback(async (amount, delivery) => {
    const clean = amount.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setSendQuote(null);
      return;
    }
    setSendLoading(true);
    setSendError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'send_tsh', amount: clean, needsDelivery: delivery });
      if (data.success) {
        setSendQuote(data);
      } else {
        setSendError(data.error || 'Could not calculate quote');
        setSendQuote(null);
      }
    } catch (err) {
      setSendError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setSendQuote(null);
    } finally {
      setSendLoading(false);
    }
  }, []);

  const fetchWantQuote = useCallback(async (currency, amount, delivery) => {
    const clean = amount.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setWantResult(null);
      return;
    }
    setWantLoading(true);
    setWantError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'want_tsh', currency, amount: clean, needsDelivery: delivery });
      if (data.success) {
        setWantResult(data);
      } else {
        setWantError(data.error || 'Could not calculate quote');
        setWantResult(null);
      }
    } catch (err) {
      setWantError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setWantResult(null);
    } finally {
      setWantLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (tab === 'send') {
      debounceRef.current = setTimeout(() => fetchSendQuote(tshAmount, needsDelivery), 500);
    } else {
      debounceRef.current = setTimeout(() => fetchWantQuote(wantCurrency, wantAmount, needsDelivery), 500);
    }
    return () => clearTimeout(debounceRef.current);
  }, [tab, tshAmount, wantCurrency, wantAmount, needsDelivery, fetchSendQuote, fetchWantQuote]);

  const handleSwitchTab = (next) => {
    setTab(next);
    setSendError('');
    setWantError('');
  };

  const handleGetQuoteSend = (currency) => {
    const netAmount = sendQuote?.results?.[currency];
    if (netAmount === null || netAmount === undefined) return;
    const grossAmount = (sendQuote.grossResults ?? sendQuote.results)[currency];
    const tshAmountNum = parseFloat(tshAmount.replace(/,/g, ''));
    setQuote({
      direction: 'send_tsh',
      fromCurrency: 'TZS',
      toCurrency: currency,
      sendAmount: tshAmountNum,
      receiveAmount: netAmount,
      rateUsed: tshAmountNum / grossAmount, // pure sell rate, unaffected by delivery fee
      needsDelivery: sendQuote.needsDelivery,
      grossAmount,
      deliveryFeeAmount: sendQuote.deliveryFees?.[currency] ?? 0,
    });
  };

  const handleGetQuoteWant = () => {
    if (!wantResult) return;
    setQuote({
      direction: 'want_tsh',
      fromCurrency: wantCurrency,
      toCurrency: 'TZS',
      sendAmount: parseFloat(wantAmount.replace(/,/g, '')),
      receiveAmount: wantResult.finalTsh,
      rateUsed: wantResult.buyRate,
      needsDelivery: wantResult.needsDelivery,
      grossAmount: wantResult.grossTsh ?? wantResult.finalTsh,
      deliveryFeeAmount: wantResult.deliveryFeeTsh ?? 0,
    });
  };

  const handleReset = () => {
    setQuote(null);
    setTshAmount('');
    setSendQuote(null);
    setWantAmount('');
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

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        <button
          onClick={() => handleSwitchTab('send')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
            tab === 'send'
              ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-gold-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          Client Sends TSh
        </button>
        <button
          onClick={() => handleSwitchTab('want')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
            tab === 'want'
              ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-gold-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          Client Wants TSh
        </button>
      </div>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 -mt-2">
        {tab === 'send'
          ? 'Client has Tanzanian Shillings, exchanger gives TL, USD, EUR or GBP'
          : 'Client has TL, USD, EUR or GBP, exchanger gives Tanzanian Shillings'}
      </p>

      {tab === 'send' ? (
        <div className="space-y-5">
          {/* Client Sends */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Client Sends
            </label>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 focus-within:ring-2 focus-within:ring-gold-500 transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={tshAmount}
                    onChange={(e) => setTshAmount(formatNumberInput(e.target.value))}
                    placeholder="0"
                    className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-white outline-none placeholder-slate-300 dark:placeholder-slate-600"
                  />
                  <p className="text-xs text-slate-400 mt-1">{currencyFlag('TZS')} TSh (Tanzanian Shilling)</p>
                </div>
              </div>
            </div>
          </div>

          <DeliveryCheckbox checked={needsDelivery} onChange={setNeedsDelivery} feeTl={deliveryFeeTl} />

          {/* Exchanger Gives — all four at once */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Exchanger Gives
            </label>
            {sendLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                <svg className="animate-spin w-5 h-5 text-gold-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Calculating…
              </div>
            ) : (
              <div className="space-y-2">
                {FOREIGN_CURRENCIES.map((c) => {
                  const amount = sendQuote?.results?.[c];
                  return (
                    <div
                      key={c}
                      className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400">{currencyFlag(c)} {c}</p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 break-words">
                          {amount !== null && amount !== undefined ? formatAmount(amount, c) : '—'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleGetQuoteSend(c)}
                        disabled={amount === null || amount === undefined}
                        className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Get Quote →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sendError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 text-center">
              {sendError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Client Sends (foreign currency) */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Client Sends
            </label>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 focus-within:ring-2 focus-within:ring-gold-500 transition-shadow">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={wantAmount}
                    onChange={(e) => setWantAmount(formatNumberInput(e.target.value))}
                    placeholder="0.00"
                    className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-white outline-none placeholder-slate-300 dark:placeholder-slate-600"
                  />
                </div>
                <div className="w-32 sm:w-36 shrink-0">
                  <CurrencySelector
                    value={wantCurrency}
                    onChange={setWantCurrency}
                    currencies={FOREIGN_CURRENCIES}
                  />
                </div>
              </div>
            </div>
          </div>

          <DeliveryCheckbox checked={needsDelivery} onChange={setNeedsDelivery} feeTl={deliveryFeeTl} />

          {/* Exchanger Gives */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Exchanger Gives
            </label>
            {wantLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                <svg className="animate-spin w-5 h-5 text-gold-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Calculating…
              </div>
            ) : wantResult ? (
              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Our rate</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    1 {currencyDisplayLabel(wantCurrency)} = {formatAmount(wantResult.buyRate, 'TZS')}
                  </span>
                </div>
                {wantResult.needsDelivery && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Gross</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{formatAmount(wantResult.grossTsh, 'TZS')}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">− Delivery fee</span>
                      <span className="font-semibold text-red-500">−{formatAmount(wantResult.deliveryFeeTsh, 'TZS')}</span>
                    </div>
                  </>
                )}
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Exchanger gives</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(wantResult.finalTsh, 'TZS')}</span>
                </div>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-300 dark:text-slate-600 py-2">0 TSh</p>
            )}
          </div>

          {wantError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 text-center">
              {wantError}
            </div>
          )}

          <button
            onClick={handleGetQuoteWant}
            disabled={!wantResult || wantLoading}
            className="w-full py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 active:from-gold-600 active:to-gold-800 text-brand-950 shadow-lg shadow-gold-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Get Quote →
          </button>
        </div>
      )}

      <RatesFooter ratesInfo={ratesInfo} />

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Estimate only — final amount is confirmed at the time of transaction.
      </p>
    </div>
  );
}

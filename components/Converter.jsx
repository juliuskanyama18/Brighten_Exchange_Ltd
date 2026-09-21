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

export default function Converter({ paymentDetails }) {
  const [tab, setTab] = useState('send'); // 'send' = I send TSh, 'want' = I want TSh
  const [ratesInfo, setRatesInfo] = useState(null);
  const [quote, setQuote] = useState(null);

  // ---- Tab 1: I send TSh ----
  const [tshAmount, setTshAmount] = useState('');
  const [sendResults, setSendResults] = useState(null); // { TL, USD, EUR, GBP }
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');

  // ---- Tab 2: I want TSh ----
  const [wantCurrency, setWantCurrency] = useState('USD');
  const [wantAmount, setWantAmount] = useState('');
  const [wantResult, setWantResult] = useState(null); // { grossTsh, sendingFeeTsh, commissionTsh, finalTsh }
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
      }
    }).catch(() => {});
  }, []);

  const fetchSendQuote = useCallback(async (amount) => {
    const clean = amount.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setSendResults(null);
      return;
    }
    setSendLoading(true);
    setSendError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'send_tsh', amount: clean });
      if (data.success) {
        setSendResults(data.results);
      } else {
        setSendError(data.error || 'Could not calculate quote');
        setSendResults(null);
      }
    } catch (err) {
      setSendError(err.response?.data?.error || 'Could not get rate. Check connection.');
      setSendResults(null);
    } finally {
      setSendLoading(false);
    }
  }, []);

  const fetchWantQuote = useCallback(async (currency, amount) => {
    const clean = amount.replace(/,/g, '');
    if (!clean || parseFloat(clean) <= 0) {
      setWantResult(null);
      return;
    }
    setWantLoading(true);
    setWantError('');
    try {
      const { data } = await axios.post('/api/quote', { direction: 'want_tsh', currency, amount: clean });
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
      debounceRef.current = setTimeout(() => fetchSendQuote(tshAmount), 500);
    } else {
      debounceRef.current = setTimeout(() => fetchWantQuote(wantCurrency, wantAmount), 500);
    }
    return () => clearTimeout(debounceRef.current);
  }, [tab, tshAmount, wantCurrency, wantAmount, fetchSendQuote, fetchWantQuote]);

  const handleSwitchTab = (next) => {
    setTab(next);
    setSendError('');
    setWantError('');
  };

  const handleGetQuoteSend = (currency) => {
    const amount = sendResults?.[currency];
    if (amount === null || amount === undefined) return;
    setQuote({
      direction: 'send_tsh',
      fromCurrency: 'TZS',
      toCurrency: currency,
      sendAmount: parseFloat(tshAmount.replace(/,/g, '')),
      receiveAmount: amount,
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
      breakdown: {
        grossTsh: wantResult.grossTsh,
        sendingFeeTsh: wantResult.sendingFeeTsh,
        commissionTsh: wantResult.commissionTsh,
      },
    });
  };

  const handleReset = () => {
    setQuote(null);
    setTshAmount('');
    setSendResults(null);
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
          I Send TSh
        </button>
        <button
          onClick={() => handleSwitchTab('want')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
            tab === 'want'
              ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-gold-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          I Want TSh
        </button>
      </div>

      {tab === 'send' ? (
        <div className="space-y-5">
          {/* You Send */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              You Send
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

          {/* You Receive — all four at once */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              You Will Receive
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
                  const amount = sendResults?.[c];
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
          {/* You Send (foreign currency) */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              You Send
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

          {/* Breakdown */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              You Will Receive
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
                  <span className="text-slate-500">Gross converted amount</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{formatAmount(wantResult.grossTsh, 'TZS')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">− Platform sending fee</span>
                  <span className="font-semibold text-red-500">−{formatAmount(wantResult.sendingFeeTsh, 'TZS')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">− Brighten commission</span>
                  <span className="font-semibold text-red-500">−{formatAmount(wantResult.commissionTsh, 'TZS')}</span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">You receive</span>
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

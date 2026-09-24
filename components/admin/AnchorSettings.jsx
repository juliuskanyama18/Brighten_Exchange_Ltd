'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDate } from '@/utils/formatting';

export default function AnchorSettings({ settings, onUpdate }) {
  const [form, setForm] = useState({
    anchorTshPerTl: settings?.anchorTshPerTl ?? 60,
    marginPercent:  settings?.marginPercent  ?? 5,
    whatsappNumber: settings?.whatsappNumber ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [saveError, setSaveError] = useState('');

  const [rates, setRates] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');

  const loadRates = async () => {
    setRatesLoading(true);
    try {
      const { data } = await axios.get('/api/rates');
      if (data.success) setRates(data);
    } finally {
      setRatesLoading(false);
    }
  };

  useEffect(() => { loadRates(); }, []);

  const anchorNum = Number(form.anchorTshPerTl);
  const marginNum = Number(form.marginPercent);
  const marginValid = Number.isFinite(marginNum) && marginNum >= 0 && marginNum < 100;
  const anchorValid = Number.isFinite(anchorNum) && anchorNum >= 1;

  // Live preview of what each currency's buy/sell price will be, computed
  // the same way lib/calc.js does — so the admin can sanity-check the
  // margin before saving.
  const referenceRate = (currency) => {
    if (currency === 'TL') return anchorValid ? anchorNum : null;
    return rates?.rates?.[currency]?.tzsPerUnit ?? null;
  };
  const previewRows = ['TL', 'USD', 'EUR', 'GBP'].map((c) => {
    const ref = referenceRate(c);
    if (ref === null || !marginValid) return { currency: c, sell: null, buy: null };
    return {
      currency: c,
      sell: ref * (1 + marginNum / 100),
      buy:  ref * (1 - marginNum / 100),
    };
  });

  const handleSave = async () => {
    // Catch a blank/invalid field here — otherwise parseFloat('') = NaN,
    // JSON.stringify silently turns NaN into null, and the field would save
    // as null (this previously broke every "I want TSh" quote in production).
    if (!anchorValid) {
      setSaveError('Anchor rate must be a number of at least 1 — it looks empty or invalid.');
      return;
    }
    if (!marginValid) {
      setSaveError('Margin must be a number between 0 and 99.');
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      const { data } = await axios.put('/api/admin/settings', {
        anchorTshPerTl: anchorNum,
        marginPercent:  marginNum,
        whatsappNumber: form.whatsappNumber.trim(),
      });
      if (data.success) {
        onUpdate(data.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setSaveError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const { data } = await axios.post('/api/admin/rates/refresh');
      if (data.success) {
        await loadRates();
      } else {
        setRefreshError(data.error || 'Refresh failed');
      }
    } catch (err) {
      setRefreshError(err.response?.data?.error || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Anchor Rate */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">TL Reference Rate</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          This is YOUR business rate — not a market rate, and the ExchangeRate-API will never overwrite it.
          It's the center point for TL: your margin below is applied on top of it to get your buy and sell prices.
        </p>
        <div className="max-w-xs">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            1 TL = ? TSh
          </label>
          <input
            type="number"
            step="0.5"
            value={form.anchorTshPerTl}
            onChange={(e) => setForm({ ...form, anchorTshPerTl: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <p className="text-xs text-slate-400 mt-1">Default: 60</p>
        </div>
      </div>

      {/* Margin */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Margin (Buy/Sell Spread)</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          This is your entire profit margin — no separate commission or sending fee on top. It's applied to
          EVERY currency (TL, USD, EUR, GBP), in BOTH directions: when a customer buys currency from you, you
          charge this much above the reference rate; when they sell currency to you, you pay this much below it.
        </p>
        <div className="max-w-xs">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Margin (%)
          </label>
          <input
            type="number"
            step="0.5"
            value={form.marginPercent}
            onChange={(e) => setForm({ ...form, marginPercent: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <p className="text-xs text-slate-400 mt-1">Default: 5</p>
        </div>

        {/* Live preview of resulting buy/sell prices */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-2 pr-4">Currency</th>
                <th className="py-2 pr-4">You Sell At</th>
                <th className="py-2">You Buy At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {previewRows.map((row) => (
                <tr key={row.currency}>
                  <td className="py-2 pr-4 font-semibold text-slate-900 dark:text-white">{row.currency}</td>
                  <td className="py-2 pr-4 text-emerald-600 dark:text-emerald-400 font-mono">
                    {row.sell !== null ? `${row.sell.toFixed(row.currency === 'TL' ? 2 : 2)} TSh` : '—'}
                  </td>
                  <td className="py-2 text-red-500 font-mono">
                    {row.buy !== null ? `${row.buy.toFixed(2)} TSh` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">WhatsApp Number</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Used for the "Start on WhatsApp" button. International format, e.g. 905xxxxxxxxx.
        </p>
        <input
          value={form.whatsappNumber}
          onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
          placeholder="905xxxxxxxxx"
          className="w-full max-w-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
      </div>

      {/* Save button */}
      {saveError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
          {saveError}
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 font-bold transition-all disabled:opacity-60"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>

      {/* External Rates */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="font-bold text-slate-900 dark:text-white">External Reference Rates</h3>
          <button
            onClick={handleRefreshRates}
            disabled={refreshing}
            className="shrink-0 text-xs px-3 py-1.5 bg-gradient-to-r from-gold-400 to-gold-600 text-brand-950 rounded-lg hover:from-gold-500 hover:to-gold-700 transition-colors disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Fetched from ExchangeRate-API and cached in MongoDB. The TSh figure below is the reference rate for
          USD/EUR/GBP (your margin above is applied on top of it). TL never uses this — it always uses your
          anchor above.
        </p>

        {refreshError && (
          <div className="mb-3 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
            {refreshError}
          </div>
        )}

        {ratesLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : !rates?.hasAnyRates ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">Rates not set yet — click "Refresh Now".</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {['USD', 'EUR', 'GBP'].map((c) => (
                <div key={c} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-1">{c}</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    1 {c} = {rates.rates[c].tzsPerUnit?.toFixed(2) ?? '—'} TSh
                  </p>
                  <p className="text-xs text-slate-400">
                    (1 {c} = {rates.rates[c].tlPerUnit?.toFixed(4) ?? '—'} TL, for reference)
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Rates updated: {rates.lastFetchedAt ? formatDate(rates.lastFetchedAt) : '—'}
              {rates.isCached ? ' (serving cached rates — last refresh attempt failed)' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

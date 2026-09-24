'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDate } from '@/utils/formatting';

export default function AnchorSettings({ settings, onUpdate }) {
  const [form, setForm] = useState({
    buyMarginTlTsh: settings?.buyMarginTlTsh ?? 3,
    marginTlTsh:    settings?.marginTlTsh    ?? 5,
    deliveryFeeTl:  settings?.deliveryFeeTl  ?? 300,
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

  const buyMarginTlTshNum   = Number(form.buyMarginTlTsh);
  const marginTlTshNum      = Number(form.marginTlTsh);
  const deliveryFeeTlNum    = Number(form.deliveryFeeTl);
  const buyMarginValid = Number.isFinite(buyMarginTlTshNum) && buyMarginTlTshNum >= 0;
  const marginTlTshValid = Number.isFinite(marginTlTshNum) && marginTlTshNum >= 0;
  const deliveryFeeTlValid = Number.isFinite(deliveryFeeTlNum) && deliveryFeeTlNum >= 0;

  const tlReference = rates?.rates?.TRY?.tzsPerUnit ?? null;
  const referenceRate = (currency) => {
    if (currency === 'TL') return tlReference;
    return rates?.rates?.[currency]?.tzsPerUnit ?? null;
  };

  // Live preview of what each currency's buy/sell price will be, computed
  // the same way lib/calc.js does — TL's marked-up/down rate becomes the
  // anchor, and USD/EUR/GBP prices are derived from it via the live
  // TL-per-currency cross rate, NOT from their own reference rate directly.
  const tlSellAnchor = tlReference !== null && marginTlTshValid ? tlReference + marginTlTshNum : null;
  const tlBuyAnchor  = tlReference !== null && buyMarginValid ? tlReference - buyMarginTlTshNum : null;

  const previewRows = ['TL', 'USD', 'EUR', 'GBP'].map((c) => {
    if (c === 'TL') return { currency: c, sell: tlSellAnchor, buy: tlBuyAnchor };
    const tlPerUnit = rates?.rates?.[c]?.tlPerUnit ?? null;
    if (tlPerUnit === null) return { currency: c, sell: null, buy: null };
    return {
      currency: c,
      sell: tlSellAnchor !== null ? tlSellAnchor * tlPerUnit : null,
      buy:  tlBuyAnchor !== null ? tlBuyAnchor * tlPerUnit : null,
    };
  });

  // Effective % markup/markdown that TL's anchor pricing works out to for
  // the other currencies, purely for admin transparency — this MOVES as
  // TL's live rate moves, unlike a fixed percentage would.
  const effectiveSellPercent = tlReference && tlSellAnchor ? ((tlSellAnchor / tlReference - 1) * 100) : null;
  const effectiveBuyPercent = tlReference && tlBuyAnchor ? ((1 - tlBuyAnchor / tlReference) * 100) : null;

  const handleSave = async () => {
    // Catch a blank/invalid field here — otherwise parseFloat('') = NaN,
    // JSON.stringify silently turns NaN into null, and the field would save
    // as null (this previously broke every "I want TSh" quote in production).
    if (!buyMarginValid) {
      setSaveError('Buy margin (TSh) must be a number of at least 0.');
      return;
    }
    if (!marginTlTshValid) {
      setSaveError('TL sell margin must be a number of at least 0.');
      return;
    }
    if (!deliveryFeeTlValid) {
      setSaveError('Delivery fee must be a number of at least 0.');
      return;
    }

    setSaveError('');
    setSaving(true);
    try {
      const { data } = await axios.put('/api/admin/settings', {
        buyMarginTlTsh: buyMarginTlTshNum,
        marginTlTsh:    marginTlTshNum,
        deliveryFeeTl:  deliveryFeeTlNum,
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
      {/* Margin */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Margin — TL is the anchor for everything</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          There is no manual anchor number anymore. TL's live reference rate (an implied TRY→TZS cross-rate) gets
          marked up/down by TL's own margin first, and <strong>that marked-up/down TL rate is then used to price
          USD, EUR and GBP too</strong> (via the live TL-per-currency rate) — instead of each currency marking up
          its own reference rate independently. This means the effective % margin on USD/EUR/GBP moves over time
          as TL's live rate moves — see the preview table below for today's actual numbers.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              TL Sell Margin (TSh)
            </label>
            <input
              type="number"
              step="0.5"
              value={form.marginTlTsh}
              onChange={(e) => setForm({ ...form, marginTlTsh: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Flat TSh added to TL's live rate to build the sell anchor. Default: 5
              {effectiveSellPercent !== null && ` (≈ +${effectiveSellPercent.toFixed(1)}% today)`}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Buy Margin (TSh) — All Currencies
            </label>
            <input
              type="number"
              step="0.5"
              value={form.buyMarginTlTsh}
              onChange={(e) => setForm({ ...form, buyMarginTlTsh: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Flat TSh subtracted from TL's live rate to build the buy anchor. Default: 3
              {effectiveBuyPercent !== null && ` (≈ -${effectiveBuyPercent.toFixed(1)}% today)`}
            </p>
          </div>
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
                    {row.sell !== null ? `${row.sell.toFixed(2)} TSh` : '—'}
                  </td>
                  <td className="py-2 text-red-500 font-mono">
                    {row.buy !== null ? `${row.buy.toFixed(2)} TSh` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rates?.hasAnyRates && !ratesLoading && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              No rates fetched yet — click "Refresh Now" below to populate this preview.
            </p>
          )}
        </div>
      </div>

      {/* Delivery Fee */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Delivery Fee</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Optional, opt-in per transaction — the client (or exchanger, on their behalf) checks "needs delivery" in
          the calculator. This flat TL amount is converted into whatever currency the client is receiving (at the
          live reference rate, no margin) and deducted from it.
        </p>
        <div className="max-w-xs">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Delivery Fee (TL)
          </label>
          <input
            type="number"
            step="10"
            value={form.deliveryFeeTl}
            onChange={(e) => setForm({ ...form, deliveryFeeTl: e.target.value })}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <p className="text-xs text-slate-400 mt-1">Default: 300</p>
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
          <h3 className="font-bold text-slate-900 dark:text-white">Live Reference Rates</h3>
          <button
            onClick={handleRefreshRates}
            disabled={refreshing}
            className="shrink-0 text-xs px-3 py-1.5 bg-gradient-to-r from-gold-400 to-gold-600 text-brand-950 rounded-lg hover:from-gold-500 hover:to-gold-700 transition-colors disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Fetched from ExchangeRate-API and cached in MongoDB. These raw reference rates are shown for your own
          sanity-checking only — USD/EUR/GBP prices are no longer computed directly from these, they're derived
          from the TL anchor above (see the preview table).
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              {['TL', 'USD', 'EUR', 'GBP'].map((c) => (
                <div key={c} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-1">{c}</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    1 {c} = {referenceRate(c)?.toFixed(2) ?? '—'} TSh
                  </p>
                  {c !== 'TL' && (
                    <p className="text-xs text-slate-400">
                      (1 {c} = {rates.rates[c].tlPerUnit?.toFixed(4) ?? '—'} TL, used for anchor conversion)
                    </p>
                  )}
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

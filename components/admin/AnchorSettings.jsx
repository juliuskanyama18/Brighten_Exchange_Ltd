'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatAmount, formatDate } from '@/utils/formatting';

export default function AnchorSettings({ settings, onUpdate }) {
  const [form, setForm] = useState({
    anchorTshPerTl: settings?.anchorTshPerTl ?? 60,
    commissionTl:   settings?.commissionTl   ?? 100,
    sendingFeeType:  settings?.sendingFee?.type  ?? 'flat',
    sendingFeeValue: settings?.sendingFee?.value ?? 10000,
    whatsappNumber: settings?.whatsappNumber ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

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

  const commissionTsh = form.anchorTshPerTl && form.commissionTl
    ? Number(form.commissionTl) * Number(form.anchorTshPerTl)
    : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put('/api/admin/settings', {
        anchorTshPerTl: parseFloat(form.anchorTshPerTl),
        commissionTl:   parseFloat(form.commissionTl),
        sendingFee: {
          type:  form.sendingFeeType,
          value: parseFloat(form.sendingFeeValue),
        },
        whatsappNumber: form.whatsappNumber.trim(),
      });
      if (data.success) {
        onUpdate(data.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
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
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Brighten Anchor Rate</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          This is YOUR business rate — not a market rate, and the ExchangeRate-API will never overwrite it.
          It is the sole source of truth for TSh ↔ TL and is used as a leg in every USD/EUR/GBP calculation.
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

      {/* Commission */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Brighten Commission</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Charged only when a customer sends foreign currency and wants TSh. Expressed as "X TL worth of TSh",
          so it automatically scales if the anchor above changes.
        </p>
        <div className="flex items-end gap-4">
          <div className="max-w-xs">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Commission (TL)
            </label>
            <input
              type="number"
              step="1"
              value={form.commissionTl}
              onChange={(e) => setForm({ ...form, commissionTl: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
            <p className="text-xs text-slate-400 mt-1">Default: 100</p>
          </div>
          <p className="text-sm text-slate-500 pb-2.5">
            = <span className="font-semibold text-slate-900 dark:text-white">{formatAmount(commissionTsh, 'TZS')}</span> at the current anchor
          </p>
        </div>
      </div>

      {/* Sending Fee */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-1">Platform Sending Fee</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Separate from the commission above. Also only applied when a customer sends foreign currency and wants TSh.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Type</label>
            <select
              value={form.sendingFeeType}
              onChange={(e) => setForm({ ...form, sendingFeeType: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
            >
              <option value="flat">Flat (TZS)</option>
              <option value="percentage">Percentage (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Value {form.sendingFeeType === 'percentage' ? '(%)' : '(TZS)'}
            </label>
            <input
              type="number"
              step={form.sendingFeeType === 'percentage' ? '0.1' : '100'}
              value={form.sendingFeeValue}
              onChange={(e) => setForm({ ...form, sendingFeeValue: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
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
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 font-bold transition-all disabled:opacity-60"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Settings'}
      </button>

      {/* External Rates */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-900 dark:text-white">External Reference Rates</h3>
          <button
            onClick={handleRefreshRates}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 bg-gradient-to-r from-gold-400 to-gold-600 text-brand-950 rounded-lg hover:from-gold-500 hover:to-gold-700 transition-colors disabled:opacity-60"
          >
            {refreshing ? 'Refreshing…' : 'Refresh Now'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Fetched from ExchangeRate-API and cached in MongoDB. Used for the TL/TZS leg of USD/EUR/GBP
          calculations — never for TSh/TL, which always uses the anchor above.
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
            <div className="grid grid-cols-3 gap-3 mb-3">
              {['USD', 'EUR', 'GBP'].map((c) => (
                <div key={c} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-500 mb-1">{c}</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    1 {c} = {rates.rates[c].tlPerUnit?.toFixed(4) ?? '—'} TL
                  </p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    1 {c} = {rates.rates[c].tzsPerUnit?.toFixed(2) ?? '—'} TSh
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

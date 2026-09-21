'use client';

import { useState } from 'react';
import axios from 'axios';

export default function PaymentManager({ settings, onUpdate }) {
  const pd = settings?.paymentDetails || {};
  const [form, setForm] = useState({
    nmb: {
      accountName:   pd.nmb?.accountName   || 'JULIUS GODWIN KANYAMA',
      accountNumber: pd.nmb?.accountNumber || '22210027343',
    },
    airtel: {
      phone:       pd.airtel?.phone       || '+255782025468',
      accountName: pd.airtel?.accountName || 'JULIUS GODWIN KANYAMA',
    },
    displayName: settings?.displayName || 'Brighten Exchange Ltd',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await axios.patch('/api/admin/settings', {
        paymentDetails: { nmb: form.nmb, airtel: form.airtel },
        displayName: form.displayName,
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

  return (
    <div className="space-y-6">
      {/* Display name */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Business Display Name</h3>
        <input
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-gold-500"
        />
      </div>

      {/* NMB Bank */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">N</div>
          <h3 className="font-bold text-slate-900 dark:text-white">NMB Bank Details</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Account Name</label>
            <input
              value={form.nmb.accountName}
              onChange={(e) => setForm({ ...form, nmb: { ...form.nmb, accountName: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Account Number</label>
            <input
              value={form.nmb.accountNumber}
              onChange={(e) => setForm({ ...form, nmb: { ...form.nmb, accountNumber: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
        </div>
      </div>

      {/* Airtel Money */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center text-white font-bold text-sm">A</div>
          <h3 className="font-bold text-slate-900 dark:text-white">Airtel Money Details</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Phone Number</label>
            <input
              value={form.airtel.phone}
              onChange={(e) => setForm({ ...form, airtel: { ...form.airtel, phone: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Account Name</label>
            <input
              value={form.airtel.accountName}
              onChange={(e) => setForm({ ...form, airtel: { ...form.airtel, accountName: e.target.value } })}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 font-bold transition-all disabled:opacity-60"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Payment Details'}
      </button>
    </div>
  );
}

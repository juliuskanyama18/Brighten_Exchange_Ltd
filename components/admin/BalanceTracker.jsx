'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatAmount, currencyFlag } from '@/utils/formatting';

const CURRENCY_COLORS = {
  TZS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  TRY: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  USD: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  GBP: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  EUR: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
};

export default function BalanceTracker() {
  const [balances, setBalances] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(null); // { currency, account }
  const [editVal,  setEditVal]  = useState({ amount: '', note: '' });
  const [saving,   setSaving]   = useState(false);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/balances');
      if (data.success) setBalances(data.balances);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBalances(); }, []);

  const startEdit = (balance) => {
    setEditing({ currency: balance.currency, account: balance.account });
    setEditVal({ amount: balance.amount, note: balance.note || '' });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await axios.patch('/api/admin/balances', { ...editing, ...editVal });
      setEditing(null);
      await fetchBalances();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading balances…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {balances.map((balance) => {
          const isEditing = editing?.currency === balance.currency && editing?.account === balance.account;
          const colorClass = CURRENCY_COLORS[balance.currency] || 'bg-slate-100 text-slate-700';

          return (
            <div
              key={`${balance.currency}-${balance.account}`}
              className={`rounded-2xl border p-5 transition-all duration-200 ${colorClass}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currencyFlag(balance.currency)}</span>
                    <span className="font-bold text-sm">{balance.currency}</span>
                  </div>
                  <p className="text-xs opacity-70 mt-0.5">{balance.account}</p>
                </div>
                <button
                  onClick={() => isEditing ? setEditing(null) : startEdit(balance)}
                  className="text-xs px-2 py-1 bg-white/50 dark:bg-black/20 rounded-lg hover:bg-white/80 transition-colors"
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    value={editVal.amount}
                    onChange={(e) => setEditVal({ ...editVal, amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-white/70 dark:bg-black/20 border border-current/20 text-inherit font-bold focus:outline-none"
                    placeholder="Amount"
                  />
                  <input
                    value={editVal.note}
                    onChange={(e) => setEditVal({ ...editVal, note: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-white/70 dark:bg-black/20 border border-current/20 text-inherit focus:outline-none"
                    placeholder="Note (optional)"
                  />
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="w-full py-2 text-xs font-bold rounded-xl bg-white/80 dark:bg-black/30 hover:bg-white transition-colors disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-black mt-1">{formatAmount(balance.amount, balance.currency)}</p>
                  {balance.note && (
                    <p className="text-xs opacity-60 mt-1 truncate">{balance.note}</p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={fetchBalances}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh Balances
      </button>
    </div>
  );
}

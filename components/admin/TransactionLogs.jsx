'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { formatAmount, formatDate, currencyFlag } from '@/utils/formatting';

const STATUS_STYLES = {
  pending:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  payment_sent:  'bg-gold-100 text-gold-800 dark:bg-gold-900/30 dark:text-gold-400',
  completed:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS = {
  pending:      'Pending',
  payment_sent: 'Payment Sent',
  completed:    'Completed',
  cancelled:    'Cancelled',
};

export default function TransactionLogs() {
  const [transactions, setTransactions] = useState([]);
  const [pagination,   setPagination]   = useState({ page: 1, pages: 1, total: 0 });
  const [loading,      setLoading]      = useState(true);
  const [filters,      setFilters]      = useState({ currency: '', status: '', from: '', to: '' });
  const [page,         setPage]         = useState(1);
  const [updating,     setUpdating]     = useState(null);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, ...filters });
      Object.keys(filters).forEach((k) => { if (!filters[k]) params.delete(k); });
      const { data } = await axios.get(`/api/admin/transactions?${params}`);
      if (data.success) {
        setTransactions(data.transactions);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransactions(); }, [page, filters]);

  const updateStatus = async (reference, status) => {
    setUpdating(reference);
    try {
      await axios.patch('/api/admin/transactions', { reference, status });
      await fetchTransactions();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            value={filters.currency}
            onChange={(e) => { setFilters({ ...filters, currency: e.target.value }); setPage(1); }}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="">All Currencies</option>
            {['TZS','TRY','USD','GBP','EUR'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="payment_sent">Payment Sent</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            value={filters.from}
            onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }}
            className="px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {pagination.total} transaction{pagination.total !== 1 ? 's' : ''} found
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No transactions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  {['Reference','Customer','Date','Direction','Send','Receive','Rate Used','Status','Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-brand-700 dark:text-gold-400 font-semibold">
                      {tx.reference}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-semibold text-slate-900 dark:text-white">{tx.customer?.name || '—'}</p>
                      <p className="text-xs text-slate-400">{tx.customer?.phone || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      {tx.direction === 'send_tsh' ? 'Send TSh' : 'Want TSh'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      {currencyFlag(tx.sendCurrency)} {formatAmount(tx.sendAmount, tx.sendCurrency)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {currencyFlag(tx.receiveCurrency)} {formatAmount(tx.receiveAmount, tx.receiveCurrency)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {tx.rateUsed ? `${tx.rateUsed.toFixed(2)} TSh` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[tx.status]}`}>
                        {STATUS_LABELS[tx.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tx.status}
                        disabled={updating === tx.reference}
                        onChange={(e) => updateStatus(tx.reference, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-50"
                      >
                        <option value="pending">Pending</option>
                        <option value="payment_sent">Payment Sent</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

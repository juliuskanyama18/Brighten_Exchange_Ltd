'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import logo from '@/public/logo.png';
import AnchorSettings from '@/components/admin/AnchorSettings';
import PaymentManager from '@/components/admin/PaymentManager';
import TransactionLogs from '@/components/admin/TransactionLogs';
import BalanceTracker  from '@/components/admin/BalanceTracker';
import CustomerList    from '@/components/admin/CustomerList';

const TABS = [
  { id: 'overview',      label: 'Overview',    icon: '📊' },
  { id: 'settings',      label: 'Settings',    icon: '⚙️' },
  { id: 'payments',      label: 'Payments',    icon: '💳' },
  { id: 'transactions',  label: 'Transactions',icon: '📋' },
  { id: 'customers',     label: 'Customers',   icon: '👤' },
  { id: 'balances',      label: 'Balances',    icon: '💰' },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [settings,  setSettings]  = useState(null);
  const [stats,     setStats]     = useState({ total: 0, pending: 0, completed: 0 });
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, txRes] = await Promise.all([
          axios.get('/api/admin/settings'),
          axios.get('/api/admin/transactions?page=1'),
        ]);
        if (settingsRes.data.success) setSettings(settingsRes.data.settings);
        if (txRes.data.success) {
          const txs = txRes.data.transactions;
          setStats({
            total:     txRes.data.pagination.total,
            pending:   txs.filter((t) => t.status === 'pending').length,
            completed: txs.filter((t) => t.status === 'completed').length,
          });
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleLogout = async () => {
    await axios.delete('/api/admin/auth');
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading dashboard…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src={logo} alt="Brighten Plus" className="h-8 w-auto" />
            <p className="text-xs text-slate-500 border-l border-slate-200 dark:border-slate-700 pl-2">Admin</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-brand-700 dark:hover:text-gold-400 transition-colors hidden sm:block">
              View Site ↗
            </a>
            <button
              onClick={handleLogout}
              className="text-xs px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tab navigation */}
        <nav className="flex gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
                ${activeTab === tab.id
                  ? 'bg-gradient-to-r from-gold-400 to-gold-600 text-brand-950 shadow-md shadow-gold-500/20'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                }
              `}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Overview</h2>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Transactions', value: stats.total, color: 'text-brand-700 dark:text-gold-400', bg: 'bg-brand-50 dark:bg-brand-900/20' },
                { label: 'Pending',  value: stats.pending,   color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
                { label: 'TL Sell Margin', value: `+${settings?.marginTlTsh ?? '—'} TSh`, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
                { label: 'Buy Margin (all)', value: `-${settings?.buyMarginPercent ?? '—'}%`, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
              ].map((stat) => (
                <div key={stat.label} className={`${stat.bg} rounded-2xl p-5 border border-transparent`}>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{stat.label}</p>
                  <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Current settings summary */}
            {settings && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                <h3 className="font-bold text-slate-900 dark:text-white mb-4">Current Configuration</h3>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">TL Sell Margin (anchor for all)</span>
                      <span className="font-semibold text-slate-900 dark:text-white">+{settings.marginTlTsh} TSh</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Buy Margin (all currencies)</span>
                      <span className="font-semibold text-slate-900 dark:text-white">-{settings.buyMarginPercent}%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">NMB Account</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs">{settings.paymentDetails?.nmb?.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Airtel</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs">{settings.paymentDetails?.airtel?.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Selcom</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs">{settings.paymentDetails?.selcom?.accountNumber || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">WhatsApp</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white text-xs">{settings.whatsappNumber || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && settings && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Margin Settings</h2>
            <AnchorSettings settings={settings} onUpdate={setSettings} />
          </div>
        )}

        {/* Payment Details */}
        {activeTab === 'payments' && settings && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Payment Details Manager</h2>
            <PaymentManager settings={settings} onUpdate={setSettings} />
          </div>
        )}

        {/* Transaction Logs */}
        {activeTab === 'transactions' && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Transaction Logs</h2>
            <TransactionLogs />
          </div>
        )}

        {/* Customers */}
        {activeTab === 'customers' && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Customers</h2>
            <CustomerList />
          </div>
        )}

        {/* Balances */}
        {activeTab === 'balances' && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-5">Balance Tracker</h2>
            <BalanceTracker />
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { formatAmount } from '@/utils/formatting';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="
        flex items-center gap-1 text-xs font-medium px-3 py-1.5
        bg-gold-50 dark:bg-gold-900/20 text-brand-700 dark:text-gold-400
        hover:bg-gold-100 dark:hover:bg-gold-900/30
        rounded-lg transition-colors duration-150 shrink-0
      "
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-1 py-2.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-slate-900 dark:text-white break-all">{value}</span>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function PaymentDetails({ paymentDetails, sendAmount, sendCurrency, reference, onMethodChange }) {
  const [activeTab, setActiveTab] = useState('nmb');

  const selectTab = (tab) => {
    setActiveTab(tab);
    onMethodChange?.(tab === 'nmb' ? 'NMB' : 'Airtel');
  };

  if (!paymentDetails) return null;

  const { nmb, airtel } = paymentDetails;
  const amountDisplay = formatAmount(sendAmount, sendCurrency);

  return (
    <div className="animate-slide-up">
      {/* Instruction banner */}
      <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="text-amber-500 text-xl">💳</div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Send exactly {amountDisplay} to complete your exchange
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Use the payment details below, then confirm your payment.
              Your reference is <span className="font-mono font-bold">{reference}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4">
        <button
          onClick={() => selectTab('nmb')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
            activeTab === 'nmb'
              ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-gold-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          🏦 NMB Bank
        </button>
        <button
          onClick={() => selectTab('airtel')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
            activeTab === 'airtel'
              ? 'bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          📱 Airtel Money
        </button>
      </div>

      {/* NMB Details */}
      {activeTab === 'nmb' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-700 to-brand-900 rounded-lg flex items-center justify-center text-gold-300 text-sm font-bold">N</div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">NMB Bank Transfer</p>
              <p className="text-xs text-slate-500">Tanzania</p>
            </div>
          </div>
          <DetailRow label="Account Name"   value={nmb.accountName} />
          <DetailRow label="Account Number" value={nmb.accountNumber} />
          <DetailRow label="Amount to Send" value={amountDisplay} />
        </div>
      )}

      {/* Airtel Details */}
      {activeTab === 'airtel' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">A</div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Airtel Money</p>
              <p className="text-xs text-slate-500">Mobile Transfer</p>
            </div>
          </div>
          <DetailRow label="Phone Number"  value={airtel.phone} />
          <DetailRow label="Account Name"  value={airtel.accountName} />
          <DetailRow label="Amount to Send" value={amountDisplay} />
        </div>
      )}
    </div>
  );
}

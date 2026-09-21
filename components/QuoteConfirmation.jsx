'use client';

import { useState } from 'react';
import axios from 'axios';
import PaymentDetails from './PaymentDetails';
import { formatAmount, currencyFlag, currencyDisplayLabel } from '@/utils/formatting';

function buildWhatsAppMessage(quote) {
  const { direction, fromCurrency, toCurrency, sendAmount, receiveAmount, breakdown } = quote;
  const lines = ['Hello Brighten Exchange,', '', 'I would like to exchange:'];

  if (direction === 'send_tsh') {
    lines.push(`${formatAmount(sendAmount, 'TZS')} TSh`);
    lines.push('');
    lines.push(`Estimated ${currencyDisplayLabel(toCurrency)} I receive: ${formatAmount(receiveAmount, toCurrency)}`);
  } else {
    lines.push(`${formatAmount(sendAmount, fromCurrency)} ${currencyDisplayLabel(fromCurrency)}`);
    lines.push('');
    lines.push(`Estimated TSh I receive: ${formatAmount(receiveAmount, 'TZS')}`);
    if (breakdown) {
      lines.push(`(after ${formatAmount(breakdown.sendingFeeTsh, 'TZS')} sending fee + ${formatAmount(breakdown.commissionTsh, 'TZS')} commission)`);
    }
  }

  lines.push('', 'Please confirm the current rate and transaction details. I understand this is an estimate.');
  return lines.join('\n');
}

export default function QuoteConfirmation({ quote, paymentDetails, onBack, onReset }) {
  const { fromCurrency, toCurrency, sendAmount, receiveAmount, direction, breakdown } = quote;

  const [step, setStep]           = useState('confirm'); // 'confirm' | 'payment' | 'done'
  const [loading, setLoading]     = useState(false);
  const [reference, setReference] = useState(null);
  const [error, setError]         = useState('');
  const [customerName, setCustomerName]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('NMB');

  const whatsappNumber = paymentDetails?.whatsappNumber;
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(quote))}`
    : null;

  const handleConfirm = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Please enter your name and phone number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/transaction', {
        direction,
        fromCurrency,
        toCurrency,
        sendAmount,
        customerName,
        customerPhone,
      });
      if (data.success) {
        setReference(data.reference);
        setStep('payment');
      } else {
        setError(data.error || 'Failed to create transaction');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSent = async () => {
    if (!reference) return;
    try {
      await axios.patch('/api/transaction', { reference, status: 'payment_sent', method: paymentMethod });
    } catch {/* non-blocking */}
    setStep('done');
  };

  // ---- CONFIRM STEP ----
  if (step === 'confirm') {
    return (
      <div className="animate-slide-up space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Confirm Your Quote</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Review the details before proceeding</p>
        </div>

        {/* Summary card */}
        <div className="bg-gradient-to-br from-brand-800 to-brand-950 border border-gold-500/30 rounded-2xl p-6 text-white">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 sm:gap-2">
            {/* Send side */}
            <div className="text-center min-w-0 w-full sm:w-auto">
              <p className="text-gold-300 text-xs uppercase tracking-wide mb-1">You Send</p>
              <p className="text-2xl sm:text-3xl font-bold break-words">{formatAmount(sendAmount, fromCurrency)}</p>
              <p className="text-gold-300 text-sm mt-1">
                {currencyFlag(fromCurrency)} {currencyDisplayLabel(fromCurrency)}
              </p>
            </div>

            {/* Arrow */}
            <div className="flex sm:flex-col items-center justify-center shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center rotate-90 sm:rotate-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>

            {/* Receive side */}
            <div className="text-center min-w-0 w-full sm:w-auto">
              <p className="text-gold-300 text-xs uppercase tracking-wide mb-1">You Receive</p>
              <p className="text-2xl sm:text-3xl font-bold break-words">{formatAmount(receiveAmount, toCurrency)}</p>
              <p className="text-gold-300 text-sm mt-1">
                {currencyFlag(toCurrency)} {currencyDisplayLabel(toCurrency)}
              </p>
            </div>
          </div>
        </div>

        {/* Fee breakdown — only shown when the customer is sending foreign currency for TSh */}
        {direction === 'want_tsh' && breakdown && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Gross converted amount</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatAmount(breakdown.grossTsh, 'TZS')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">− Platform sending fee</span>
              <span className="font-semibold text-red-500">−{formatAmount(breakdown.sendingFeeTsh, 'TZS')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">− Brighten commission</span>
              <span className="font-semibold text-red-500">−{formatAmount(breakdown.commissionTsh, 'TZS')}</span>
            </div>
            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
            <div className="flex justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-200">= Customer receives</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(receiveAmount, 'TZS')}</span>
            </div>
          </div>
        )}

        {/* Notice */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            This is an estimate. The final amount is subject to confirmation and current available rates.
          </p>
        </div>

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
          >
            💬 Start on WhatsApp
          </a>
        )}

        {/* Customer details */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Your Full Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Julius Godwin"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. +255700000000"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gold-500"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !customerName.trim() || !customerPhone.trim()}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 font-bold shadow-lg shadow-gold-500/30 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Processing…
              </span>
            ) : 'Confirm & Proceed →'}
          </button>
        </div>
      </div>
    );
  }

  // ---- PAYMENT STEP ----
  if (step === 'payment') {
    return (
      <div className="animate-slide-up space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Send Payment</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ref: <span className="font-mono font-bold text-brand-700 dark:text-gold-400">{reference}</span>
          </p>
        </div>

        {fromCurrency === 'TZS' ? (
          <PaymentDetails
            paymentDetails={paymentDetails}
            sendAmount={sendAmount}
            sendCurrency={fromCurrency}
            reference={reference}
            onMethodChange={setPaymentMethod}
          />
        ) : (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Send {formatAmount(sendAmount, fromCurrency)} {currencyDisplayLabel(fromCurrency)}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Contact us on WhatsApp to arrange where to send it. Your reference is{' '}
              <span className="font-mono font-bold">{reference}</span>.
            </p>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                💬 Start on WhatsApp
              </a>
            )}
          </div>
        )}

        <button
          onClick={handlePaymentSent}
          className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-500/30 transition-all duration-200"
        >
          ✓ I Have Sent the Payment
        </button>
      </div>
    );
  }

  // ---- DONE STEP ----
  return (
    <div className="animate-slide-up text-center space-y-5 py-4">
      <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Payment Confirmed!</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
          We have received your payment notification. Your exchange will be processed shortly.
        </p>
        <div className="mt-3 inline-block px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <p className="text-xs text-slate-500">Reference</p>
          <p className="font-mono font-bold text-brand-700 dark:text-gold-400">{reference}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        You will receive {formatAmount(receiveAmount, toCurrency)} once verified. Keep your reference number.
      </p>
      <button
        onClick={onReset}
        className="mx-auto block px-8 py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-600 hover:from-gold-500 hover:to-gold-700 text-brand-950 font-semibold transition-colors"
      >
        Start New Exchange
      </button>
    </div>
  );
}

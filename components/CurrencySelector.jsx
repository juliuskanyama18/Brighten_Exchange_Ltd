'use client';

import { currencyFlag, currencyName } from '@/utils/formatting';

const DEFAULT_CURRENCIES = ['TZS', 'TL', 'USD', 'GBP', 'EUR'];

export default function CurrencySelector({ value, onChange, exclude, label, disabled, currencies = DEFAULT_CURRENCIES }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="
            w-full appearance-none cursor-pointer
            bg-white dark:bg-slate-800
            border border-slate-200 dark:border-slate-700
            text-slate-900 dark:text-white
            rounded-xl px-4 py-3 pr-10
            text-base font-semibold
            focus:outline-none focus:ring-2 focus:ring-gold-500
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {currencies.filter((c) => c !== exclude).map((currency) => (
            <option key={currency} value={currency}>
              {currencyFlag(currency)}  {currency} — {currencyName(currency)}
            </option>
          ))}
        </select>
        {/* Custom chevron */}
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

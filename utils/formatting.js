/**
 * Format a number as currency string.
 * @param {number} amount
 * @param {string} currency  e.g. 'TZS', 'USD'
 * @param {boolean} compact  true for "1.2M" style
 */
export function formatAmount(amount, currency = '', compact = false) {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';

  const symbols = { USD: '$', GBP: '£', EUR: '€', TRY: '₺', TL: '₺', TZS: 'TZS ' };
  const symbol = symbols[currency] || (currency ? `${currency} ` : '');

  if (compact && amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (compact && amount >= 1_000) {
    return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  }

  // Decimals: TZS never shows decimals; others show 2dp
  const decimals = currency === 'TZS' ? 0 : 2;

  return symbol + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Live-format a number as the user types into an input, inserting thousand
 * separators (e.g. "1000000" -> "1,000,000", "1250.5" -> "1,250.5").
 * Keeps at most one decimal point and up to 2 decimal digits. Returns the
 * cleaned/formatted string — safe to feed back into a controlled input's
 * value. Strip commas again (e.g. via parseAmount on the backend) before
 * doing math with the result.
 */
export function formatNumberInput(rawValue) {
  if (rawValue === '') return '';

  let cleaned = rawValue.replace(/[^\d.]/g, '');

  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  let [intPart, decPart] = cleaned.split('.');
  intPart = (intPart || '').replace(/^0+(?=\d)/, '');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  if (decPart !== undefined) {
    return `${withCommas}.${decPart.slice(0, 2)}`;
  }
  return withCommas;
}

export function currencyFlag(currency) {
  const flags = {
    TZS: '🇹🇿',
    TRY: '🇹🇷',
    TL: '🇹🇷',
    USD: '🇺🇸',
    GBP: '🇬🇧',
    EUR: '🇪🇺',
  };
  return flags[currency] || '💱';
}

// The business always refers to Turkish Lira as "TL", not "TRY"
export function currencyDisplayLabel(currency) {
  return currency === 'TRY' ? 'TL' : currency;
}

export function currencyName(currency) {
  const names = {
    TZS: 'Tanzanian Shilling',
    TRY: 'Turkish Lira',
    TL: 'Turkish Lira',
    USD: 'US Dollar',
    GBP: 'British Pound',
    EUR: 'Euro',
  };
  return names[currency] || currency;
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * ============================================================
 *  BRIGHTEN EXCHANGE — EXTERNAL RATE FETCHING
 * ============================================================
 *  Fetches USD/EUR/GBP/TL reference rates from ExchangeRate-API and
 *  caches them in MongoDB (via the Rate model) so the site never
 *  needs to call the external API for every customer calculation.
 *
 *  TL's rate (rateDoc.TRY.tzsPerUnit) is an IMPLIED cross-rate — the API
 *  has no direct TRY->TZS pair, so it's derived from TRY and TZS both
 *  being quoted against USD in the same response (2026-09-25: this
 *  replaced a manually-set anchor entirely, per business decision — see
 *  git history). It's still just a reference point: the actual sell/buy
 *  price has settings.marginTlTsh added on the sell side and
 *  settings.buyMarginTlTsh subtracted on the buy side (both flat TSh, see
 *  lib/calc.js), same buy mechanism as USD/EUR/GBP.
 *
 *  This file runs on the server only (Next.js API routes). The API
 *  key must never be imported into client components.
 * ============================================================
 */

import connectDB from '@/lib/mongodb';
import Rate from '@/models/Rate';

const API_KEY = process.env.EXCHANGERATE_API_KEY;
const BASE_URL = API_KEY ? `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD` : null;

// How long a cached rate is considered fresh before it's automatically
// refreshed on the next request. 15 minutes keeps rates close to live while
// staying well inside ExchangeRate-API's free-tier quota (~1,500 req/month —
// 15-min refresh is ~2,880 req/month worst case; a literal 1-minute refresh
// would be ~43,200 req/month and exhaust a free-tier key in about a day).
export const RATE_STALE_MS = 1000 * 60 * 15; // 15 minutes

/**
 * Fetch live rates from ExchangeRate-API and persist them to MongoDB.
 * Throws on failure (caller decides how to fall back).
 */
export async function refreshRatesFromApi() {
  if (!API_KEY) {
    throw new Error('EXCHANGERATE_API_KEY is not configured on the server');
  }

  await connectDB();
  const rateDoc = await Rate.getSingleton();
  rateDoc.lastAttemptAt = new Date();

  let response;
  try {
    response = await fetch(BASE_URL, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    rateDoc.lastFetchError = err.message || 'Network error contacting ExchangeRate-API';
    await rateDoc.save();
    throw err;
  }

  if (!response.ok) {
    rateDoc.lastFetchError = `ExchangeRate-API HTTP ${response.status}`;
    await rateDoc.save();
    throw new Error(rateDoc.lastFetchError);
  }

  const data = await response.json();
  if (data.result !== 'success') {
    rateDoc.lastFetchError = data['error-type'] || 'ExchangeRate-API returned a non-success result';
    await rateDoc.save();
    throw new Error(rateDoc.lastFetchError);
  }

  const conversionRates = data.conversion_rates;
  const tryRate = conversionRates.TRY; // TRY per 1 USD
  const tzsRate = conversionRates.TZS; // TZS per 1 USD

  if (!tryRate || !tzsRate) {
    rateDoc.lastFetchError = 'ExchangeRate-API response is missing TRY or TZS';
    await rateDoc.save();
    throw new Error(rateDoc.lastFetchError);
  }

  const now = new Date();
  for (const currency of ['USD', 'EUR', 'GBP']) {
    const unitsPerUsd = conversionRates[currency]; // e.g. EUR per 1 USD
    if (!unitsPerUsd) continue;
    rateDoc[currency] = {
      tlPerUnit:  tryRate / unitsPerUsd, // TRY per 1 unit of `currency`
      tzsPerUnit: tzsRate / unitsPerUsd, // TZS per 1 unit of `currency`
      updatedAt:  now,
    };
  }

  // Implied TL reference rate: TZS per 1 USD ÷ TRY per 1 USD = TZS per 1 TRY.
  // This is the live "real market" number the margin gets applied on top of.
  rateDoc.TRY = { tzsPerUnit: tzsRate / tryRate, updatedAt: now };

  rateDoc.lastFetchedAt = now;
  rateDoc.lastFetchError = '';
  await rateDoc.save();

  return rateDoc;
}

/**
 * Get the current usable rate set. Serves the cached DB copy; if it has
 * never been fetched, or is stale, attempts a refresh — but if the refresh
 * fails, falls back to whatever is cached (or nulls if never fetched).
 * Never throws — the caller always gets a usable object plus metadata.
 */
export async function getUsableRates() {
  await connectDB();
  let rateDoc = await Rate.getSingleton();

  const neverFetched = !rateDoc.lastFetchedAt;
  const isStale = rateDoc.lastFetchedAt && (Date.now() - rateDoc.lastFetchedAt.getTime() > RATE_STALE_MS);

  if (neverFetched || isStale) {
    try {
      rateDoc = await refreshRatesFromApi();
    } catch {
      // Fall through and use whatever is cached (possibly still nothing).
    }
  }

  const rates = {
    USD: { tlPerUnit: rateDoc.USD?.tlPerUnit ?? null, tzsPerUnit: rateDoc.USD?.tzsPerUnit ?? null },
    EUR: { tlPerUnit: rateDoc.EUR?.tlPerUnit ?? null, tzsPerUnit: rateDoc.EUR?.tzsPerUnit ?? null },
    GBP: { tlPerUnit: rateDoc.GBP?.tlPerUnit ?? null, tzsPerUnit: rateDoc.GBP?.tzsPerUnit ?? null },
    TRY: { tzsPerUnit: rateDoc.TRY?.tzsPerUnit ?? null }, // implied live TL reference rate
  };

  return {
    rates,
    lastFetchedAt: rateDoc.lastFetchedAt,
    isCached: !neverFetched && isStale, // fresh fetch failed, serving an older cache
    hasAnyRates: Boolean(rateDoc.lastFetchedAt),
  };
}

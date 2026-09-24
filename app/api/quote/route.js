import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getUsableRates } from '@/lib/rates';
import { calculateQuote, parseAmount, QuoteError } from '@/lib/calc';

export const dynamic = 'force-dynamic';

const DIRECTIONS = ['send_tsh', 'want_tsh'];
const CURRENCIES = ['TL', 'USD', 'EUR', 'GBP'];

// POST /api/quote — the SERVER is the source of truth for every quote.
// The frontend must never calculate the final numbers itself.
//
// body: { direction: 'send_tsh' | 'want_tsh', amount, currency? }
//   send_tsh: amount = TSh the customer is sending. Returns TL/USD/EUR/GBP,
//             each computed at our SELL rate (reference * (1 + margin%)).
//   want_tsh: currency = TL/USD/EUR/GBP the customer is giving. Returns the
//             final TSh, computed at our BUY rate (reference * (1 - margin%)).
export async function POST(request) {
  try {
    const body = await request.json();
    const { direction, currency } = body;

    if (!DIRECTIONS.includes(direction)) {
      return NextResponse.json({ success: false, error: 'Invalid direction' }, { status: 400 });
    }
    if (direction === 'want_tsh' && !CURRENCIES.includes(currency)) {
      return NextResponse.json({ success: false, error: 'Invalid currency' }, { status: 400 });
    }

    const amount = parseAmount(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Enter a valid amount' }, { status: 400 });
    }
    if (amount > 10_000_000_000) {
      return NextResponse.json({ success: false, error: 'Amount too large' }, { status: 400 });
    }

    await connectDB();
    const settings = await Settings.getSettings();
    const { rates, hasAnyRates, lastFetchedAt } = await getUsableRates();

    // "I send TSh" always needs no rate for TL, but needs rates for USD/EUR/GBP.
    // "I want TSh" in a foreign currency needs a TZS rate for that currency.
    // calculateQuote() returns nulls for currencies with no rate rather than
    // throwing, EXCEPT for want_tsh in a foreign currency, where it throws.
    let quote;
    try {
      quote = calculateQuote({ direction, currency, amount, settings, rates });
    } catch (err) {
      if (err instanceof QuoteError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      ...quote,
      anchorTshPerTl: settings.anchorTshPerTl,
      ratesLastFetchedAt: lastFetchedAt,
      ratesAvailable: hasAnyRates,
    });
  } catch (error) {
    console.error('[/api/quote]', error.message);
    return NextResponse.json({ success: false, error: 'Could not calculate quote. Try again.' }, { status: 500 });
  }
}

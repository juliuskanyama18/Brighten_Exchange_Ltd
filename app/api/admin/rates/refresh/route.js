import { NextResponse } from 'next/server';
import { refreshRatesFromApi } from '@/lib/rates';

// POST /api/admin/rates/refresh — admin-only (protected by middleware).
// Forces a fresh fetch from ExchangeRate-API and stores it in MongoDB.
// Never touches settings.anchorTshPerTl.
export async function POST() {
  try {
    const rateDoc = await refreshRatesFromApi();
    return NextResponse.json({
      success: true,
      rates: {
        USD: rateDoc.USD,
        EUR: rateDoc.EUR,
        GBP: rateDoc.GBP,
      },
      lastFetchedAt: rateDoc.lastFetchedAt,
    });
  } catch (error) {
    console.error('[/api/admin/rates/refresh]', error.message);
    return NextResponse.json({ success: false, error: error.message || 'Refresh failed' }, { status: 502 });
  }
}

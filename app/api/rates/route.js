import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getUsableRates } from '@/lib/rates';

export const dynamic = 'force-dynamic';

// GET /api/rates — public. Returns the cached external reference rates
// (TL/USD/EUR/GBP, all live from ExchangeRate-API — there's no manual
// anchor anymore). Never calls the external API synchronously on every
// request — only refreshes when the cache is stale.
export async function GET() {
  try {
    await connectDB();
    const { rates, lastFetchedAt, isCached, hasAnyRates } = await getUsableRates();

    return NextResponse.json({
      success: true,
      rates,
      hasAnyRates,
      isCached,
      lastFetchedAt,
      message: hasAnyRates ? null : 'Rates not set yet',
    });
  } catch (error) {
    console.error('[/api/rates]', error.message);
    return NextResponse.json({ success: false, error: 'Rates unavailable' }, { status: 503 });
  }
}

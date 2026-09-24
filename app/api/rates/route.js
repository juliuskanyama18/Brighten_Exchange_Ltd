import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getUsableRates } from '@/lib/rates';

export const dynamic = 'force-dynamic';

// GET /api/rates — public. Returns the cached external reference rates
// (TL/USD/EUR/GBP, all live from ExchangeRate-API — there's no manual
// anchor anymore). Never calls the external API synchronously on every
// request — only refreshes when the cache is stale. Also returns the
// delivery fee (public info — the client needs to know it before opting
// into delivery), but NOT the margin settings, which stay admin-only.
export async function GET() {
  try {
    await connectDB();
    const [{ rates, lastFetchedAt, isCached, hasAnyRates }, settings] = await Promise.all([
      getUsableRates(),
      Settings.getSettings(),
    ]);

    return NextResponse.json({
      success: true,
      rates,
      hasAnyRates,
      isCached,
      lastFetchedAt,
      deliveryFeeTl: settings.deliveryFeeTl,
      message: hasAnyRates ? null : 'Rates not set yet',
    });
  } catch (error) {
    console.error('[/api/rates]', error.message);
    return NextResponse.json({ success: false, error: 'Rates unavailable' }, { status: 503 });
  }
}

import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Balance from '@/models/Balance';

// GET /api/admin/balances
export async function GET() {
  try {
    await connectDB();
    await Balance.seedDefaults();
    const balances = await Balance.find().sort({ currency: 1, account: 1 });
    return NextResponse.json({ success: true, balances });
  } catch (error) {
    console.error('[/api/admin/balances GET]', error.message);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/admin/balances — update a balance entry
export async function PATCH(request) {
  try {
    const { currency, account, amount, note } = await request.json();
    await connectDB();

    const updated = await Balance.findOneAndUpdate(
      { currency, account },
      { amount: parseFloat(amount), note: note || '' },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, balance: updated });
  } catch (error) {
    console.error('[/api/admin/balances PATCH]', error.message);
    return NextResponse.json({ success: false, error: 'Failed to update balance' }, { status: 500 });
  }
}

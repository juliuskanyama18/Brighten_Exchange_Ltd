import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import Customer from '@/models/Customer'; // registers the 'Customer' model for populate()

// GET /api/admin/transactions?page=1&currency=TZS&status=pending&from=&to=
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const page     = parseInt(searchParams.get('page') || '1');
    const limit    = 20;
    const currency = searchParams.get('currency');
    const status   = searchParams.get('status');
    const from     = searchParams.get('from');
    const to       = searchParams.get('to');

    const query = {};
    if (currency) {
      query.$or = [{ sendCurrency: currency }, { receiveCurrency: currency }];
    }
    if (status) query.status = status;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to)   query.createdAt.$lte = new Date(to + 'T23:59:59Z');
    }

    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return NextResponse.json({
      success: true,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[/api/admin/transactions GET]', error.message);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/admin/transactions — update status or note
export async function PATCH(request) {
  try {
    const { reference, status, note } = await request.json();
    await connectDB();

    const update = {};
    if (status) update.status = status;
    if (note !== undefined) update.note = note;

    const tx = await Transaction.findOneAndUpdate({ reference }, update, { new: true });
    if (!tx) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Keep the linked payment's verification status in sync with the admin's call
    if (status === 'completed') {
      await Payment.findOneAndUpdate({ transaction: tx._id, direction: 'inbound' }, { status: 'confirmed' });
    } else if (status === 'cancelled') {
      await Payment.findOneAndUpdate({ transaction: tx._id, direction: 'inbound' }, { status: 'failed' });
    }

    return NextResponse.json({ success: true, transaction: tx });
  } catch (error) {
    console.error('[/api/admin/transactions PATCH]', error.message);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

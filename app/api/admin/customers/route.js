import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import '@/models/Transaction'; // registers the 'Transaction' collection for the $lookup below

// GET /api/admin/customers?page=1&search=julius
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const page   = parseInt(searchParams.get('page') || '1');
    const limit  = 20;
    const search = searchParams.get('search')?.trim();

    const match = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ name: re }, { phone: re }];
    }

    const total = await Customer.countDocuments(match);
    const customers = await Customer.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'transactions',
          localField: '_id',
          foreignField: 'customer',
          as: 'transactions',
        },
      },
      {
        $addFields: {
          transactionCount: { $size: '$transactions' },
          lastTransactionAt: { $max: '$transactions.createdAt' },
        },
      },
      { $project: { transactions: 0 } },
    ]);

    return NextResponse.json({
      success: true,
      customers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[/api/admin/customers GET]', error.message);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/admin/customers — edit a customer's own details (not their transactions)
export async function PATCH(request) {
  try {
    const { id, name, phone, email, note } = await request.json();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing customer id' }, { status: 400 });
    }

    await connectDB();
    const update = {};
    if (name !== undefined)  update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (email !== undefined) update.email = email;
    if (note !== undefined)  update.note = note;

    const customer = await Customer.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!customer) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, customer });
  } catch (error) {
    console.error('[/api/admin/customers PATCH]', error.message);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

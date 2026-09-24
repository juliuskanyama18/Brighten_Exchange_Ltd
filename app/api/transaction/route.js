import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Transaction from '@/models/Transaction';
import Customer from '@/models/Customer';
import Payment from '@/models/Payment';
import { getUsableRates } from '@/lib/rates';
import {
  calculateTshToOne, calculateForeignToTsh, getReferenceRate,
  convertDeliveryFeeToForeign, convertDeliveryFeeToTsh,
  parseAmount, QuoteError,
} from '@/lib/calc';

const FOREIGN_OR_TL = ['TL', 'USD', 'EUR', 'GBP'];

export const dynamic = 'force-dynamic';

const PAYMENT_METHODS = ['NMB', 'Airtel', 'Selcom', 'Bank', 'Cash', 'Other'];

// Business-facing currency label ('TL') <-> DB/ISO-style code ('TRY')
const BUSINESS_TO_DB = { TL: 'TRY', USD: 'USD', EUR: 'EUR', GBP: 'GBP' };
const DB_TO_BUSINESS = { TRY: 'TL', USD: 'USD', EUR: 'EUR', GBP: 'GBP' };

// POST /api/transaction — create a new pending transaction.
// The server ALWAYS recomputes the quote itself (source of truth); it never
// trusts a receiveAmount sent by the client.
export async function POST(request) {
  try {
    const body = await request.json();
    const { direction, customerName, customerPhone } = body;
    const needsDelivery = Boolean(body.needsDelivery);

    if (!['send_tsh', 'want_tsh'].includes(direction)) {
      return NextResponse.json({ success: false, error: 'Invalid direction' }, { status: 400 });
    }
    if (!customerName?.trim() || !customerPhone?.trim()) {
      return NextResponse.json({ success: false, error: 'Name and phone are required' }, { status: 400 });
    }

    const amount = parseAmount(body.sendAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    await connectDB();
    const settings = await Settings.getSettings();
    const { rates } = await getUsableRates();
    const buyMarginTlTsh = settings.buyMarginTlTsh;
    const marginTlTsh = settings.marginTlTsh;
    const deliveryFeeTl = settings.deliveryFeeTl;

    const customer = await Customer.findOrCreate({
      name: customerName.trim(),
      phone: customerPhone.trim(),
    });

    let txData;

    if (direction === 'send_tsh') {
      // Customer gives TSh, wants `toCurrency` (business label: TL/USD/EUR/GBP) — our SELL rate
      const toCurrency = DB_TO_BUSINESS[body.toCurrency] || body.toCurrency;
      if (!FOREIGN_OR_TL.includes(toCurrency)) {
        return NextResponse.json({ success: false, error: 'Unsupported currency' }, { status: 400 });
      }
      const { amount: grossAmount, sellRate } = calculateTshToOne(amount, toCurrency, rates, marginTlTsh);
      if (grossAmount === null) {
        return NextResponse.json({ success: false, error: 'Rates not available yet. Please try again later.' }, { status: 409 });
      }

      let receiveAmount = grossAmount;
      let deliveryFeeAmount = 0;
      if (needsDelivery) {
        const fee = convertDeliveryFeeToForeign(deliveryFeeTl, toCurrency, rates);
        if (fee === null) {
          return NextResponse.json({ success: false, error: 'Rates not available yet. Please try again later.' }, { status: 409 });
        }
        deliveryFeeAmount = fee;
        receiveAmount = Math.max(Math.round((grossAmount - fee) * 100) / 100, 0);
      }

      txData = {
        customer: customer._id,
        direction,
        sendCurrency: 'TZS',
        receiveCurrency: BUSINESS_TO_DB[toCurrency],
        sendAmount: amount,
        receiveAmount,
        referenceRate: getReferenceRate(toCurrency, rates),
        rateUsed: sellRate,
        needsDelivery,
        deliveryFeeAmount,
      };
    } else {
      // Customer gives `fromCurrency` (business label), wants TSh — our BUY rate
      const fromCurrency = DB_TO_BUSINESS[body.fromCurrency] || body.fromCurrency;
      if (!FOREIGN_OR_TL.includes(fromCurrency)) {
        return NextResponse.json({ success: false, error: 'Unsupported currency' }, { status: 400 });
      }
      const { finalTsh: grossTsh, buyRate } = calculateForeignToTsh({
        currency: fromCurrency,
        amount,
        rates,
        buyMarginTlTsh,
      });
      if (grossTsh === null) {
        return NextResponse.json({ success: false, error: 'Rates not available yet. Please try again later.' }, { status: 409 });
      }

      let finalTsh = grossTsh;
      let deliveryFeeAmount = 0;
      if (needsDelivery) {
        const fee = convertDeliveryFeeToTsh(deliveryFeeTl, rates);
        if (fee === null) {
          return NextResponse.json({ success: false, error: 'Rates not available yet. Please try again later.' }, { status: 409 });
        }
        deliveryFeeAmount = fee;
        finalTsh = Math.max(Math.round((grossTsh - fee) * 100) / 100, 0);
      }

      txData = {
        customer: customer._id,
        direction,
        sendCurrency: BUSINESS_TO_DB[fromCurrency],
        receiveCurrency: 'TZS',
        sendAmount: amount,
        receiveAmount: finalTsh,
        referenceRate: getReferenceRate(fromCurrency, rates),
        rateUsed: buyRate,
        needsDelivery,
        deliveryFeeAmount,
      };
    }

    const tx = await Transaction.create({ ...txData, status: 'pending' });

    // The customer owes us `sendAmount` in `sendCurrency` — record the expected inbound payment
    await Payment.create({
      transaction: tx._id,
      customer:    customer._id,
      direction:   'inbound',
      currency:    tx.sendCurrency,
      amount:      tx.sendAmount,
      status:      'pending',
    });

    // Return only safe fields to client
    return NextResponse.json({
      success: true,
      reference:       tx.reference,
      direction:       tx.direction,
      sendAmount:      tx.sendAmount,
      sendCurrency:    tx.sendCurrency,
      receiveAmount:   tx.receiveAmount,
      receiveCurrency: tx.receiveCurrency,
      rateUsed:        tx.rateUsed,
      needsDelivery:   tx.needsDelivery,
      deliveryFeeAmount: tx.deliveryFeeAmount,
      createdAt:       tx.createdAt,
    }, { status: 201 });

  } catch (error) {
    if (error instanceof QuoteError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error('[/api/transaction POST]', error.message);
    return NextResponse.json({ success: false, error: 'Transaction failed' }, { status: 500 });
  }
}

// PATCH /api/transaction — update status (and optionally which channel the customer paid through)
export async function PATCH(request) {
  try {
    const { reference, status, method, proofReference } = await request.json();
    if (!reference || !status) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    await connectDB();
    const tx = await Transaction.findOneAndUpdate(
      { reference },
      { status },
      { new: true }
    );
    if (!tx) return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });

    // Keep the linked inbound payment in sync with what the customer reports
    const paymentUpdate = {};
    if (method && PAYMENT_METHODS.includes(method)) paymentUpdate.method = method;
    if (proofReference) paymentUpdate.proofReference = proofReference;
    if (Object.keys(paymentUpdate).length > 0) {
      await Payment.findOneAndUpdate({ transaction: tx._id, direction: 'inbound' }, paymentUpdate);
    }

    return NextResponse.json({ success: true, status: tx.status });
  } catch (error) {
    console.error('[/api/transaction PATCH]', error.message);
    return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
  }
}

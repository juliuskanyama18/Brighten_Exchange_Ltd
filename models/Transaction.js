import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  // Every transaction must belong to a customer — enforced by the DB, not just app logic
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },

  // 'send_tsh' = customer gives TSh, receives TL/USD/EUR/GBP
  // 'want_tsh' = customer gives TL/USD/EUR/GBP, receives TSh
  direction: { type: String, required: true, enum: ['send_tsh', 'want_tsh'] },

  sendCurrency:    { type: String, required: true, enum: ['TZS', 'TRY', 'USD', 'GBP', 'EUR'] },
  receiveCurrency: { type: String, required: true, enum: ['TZS', 'TRY', 'USD', 'GBP', 'EUR'] },
  sendAmount:      { type: Number, required: true, min: 0 },
  receiveAmount:   { type: Number, required: true, min: 0 },

  // Rates/settings snapshot at the time of quote — for audit/history, never
  // recomputed retroactively if the admin later changes the margin or the
  // live reference rate moves.
  referenceRate: { type: Number, required: true }, // live reference rate (pre-margin) at quote time
  rateUsed:      { type: Number, required: true },  // the actual sell (send_tsh) or buy (want_tsh) rate applied

  // Delivery — optional, opt-in per transaction. deliveryFeeAmount is in
  // `receiveCurrency` (already deducted from receiveAmount above).
  needsDelivery:     { type: Boolean, default: false },
  deliveryFeeAmount: { type: Number, default: 0, min: 0 },

  status: {
    type: String,
    enum: ['pending', 'payment_sent', 'completed', 'cancelled'],
    default: 'pending',
  },

  reference: { type: String, unique: true }, // short ref code e.g. BEX-20240702-A3K9
  note:       { type: String, default: '' },
}, {
  timestamps: true,
});

// Generate a short unique reference
TransactionSchema.pre('save', function (next) {
  if (!this.reference) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.reference = `BEX-${dateStr}-${rand}`;
  }
  next();
});

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

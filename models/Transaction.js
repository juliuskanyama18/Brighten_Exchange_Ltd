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
  // recomputed retroactively if the admin later changes the anchor/rates.
  anchorTshPerTl:   { type: Number, required: true }, // Brighten anchor used
  foreignToTlRate:  { type: Number, default: null },  // used for send_tsh with a foreign currency
  foreignToTzsRate: { type: Number, default: null },  // used for want_tsh with a foreign currency

  // Only populated for direction === 'want_tsh'
  grossTsh:      { type: Number, default: null },
  sendingFeeTsh: { type: Number, default: null },
  commissionTsh: { type: Number, default: null },

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

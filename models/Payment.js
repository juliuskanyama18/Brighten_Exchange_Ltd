import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  customer:    { type: mongoose.Schema.Types.ObjectId, ref: 'Customer',    required: true },

  // 'inbound'  = customer paying Brighten Exchange (e.g. TZS to NMB/Airtel/Selcom)
  // 'outbound' = Brighten Exchange paying the customer (TRY/USD/GBP/EUR out)
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },

  method:   { type: String, enum: ['NMB', 'Airtel', 'Selcom', 'Bank', 'Cash', 'Other'], default: 'Other' },
  currency: { type: String, required: true, enum: ['TZS', 'TRY', 'USD', 'GBP', 'EUR'] },
  amount:   { type: Number, required: true, min: 0 },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
  },

  proofReference: { type: String, default: '' }, // e.g. bank/mobile-money txn ID the customer provides
  note:           { type: String, default: '' },
}, {
  timestamps: true,
});

export default mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

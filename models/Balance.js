import mongoose from 'mongoose';

const BalanceSchema = new mongoose.Schema({
  currency: {
    type: String,
    required: true,
    enum: ['TZS', 'TRY', 'USD', 'GBP', 'EUR'],
  },
  account: {
    type: String,
    required: true,
    // e.g. 'NMB', 'Airtel', 'Main'
  },
  amount: { type: Number, default: 0 },
  note:   { type: String, default: '' },
}, {
  timestamps: true,
});

BalanceSchema.index({ currency: 1, account: 1 }, { unique: true });

// Seed default balances if none exist
BalanceSchema.statics.seedDefaults = async function () {
  const defaults = [
    { currency: 'TZS', account: 'NMB'    },
    { currency: 'TZS', account: 'Airtel' },
    { currency: 'TRY', account: 'Main'   },
    { currency: 'USD', account: 'Main'   },
    { currency: 'GBP', account: 'Main'   },
    { currency: 'EUR', account: 'Main'   },
  ];
  for (const d of defaults) {
    await this.findOneAndUpdate(
      { currency: d.currency, account: d.account },
      { $setOnInsert: { amount: 0 } },
      { upsert: true, new: true }
    );
  }
};

export default mongoose.models.Balance || mongoose.model('Balance', BalanceSchema);

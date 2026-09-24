import mongoose from 'mongoose';

// Reference rates fetched from ExchangeRate-API, cached in Mongo so the site
// never has to hit the external API on every customer calculation.
const CurrencyRateSchema = new mongoose.Schema({
  tlPerUnit:  { type: Number, default: null }, // TRY per 1 unit of this currency
  tzsPerUnit: { type: Number, default: null }, // TZS per 1 unit of this currency
  updatedAt:  { type: Date,   default: null },
}, { _id: false });

const RateSchema = new mongoose.Schema({
  USD: { type: CurrencyRateSchema, default: () => ({}) },
  EUR: { type: CurrencyRateSchema, default: () => ({}) },
  GBP: { type: CurrencyRateSchema, default: () => ({}) },
  // Implied live TL/TZS cross-rate (tlPerUnit unused/null here — TRY per TRY is 1)
  TRY: { type: CurrencyRateSchema, default: () => ({}) },

  lastFetchedAt:  { type: Date,   default: null }, // last SUCCESSFUL fetch
  lastAttemptAt:  { type: Date,   default: null },
  lastFetchError: { type: String, default: '' },
}, {
  timestamps: true,
});

// Singleton pattern — always use one rate document
RateSchema.statics.getSingleton = async function () {
  let rate = await this.findOne();
  if (!rate) {
    rate = await this.create({});
  }
  return rate;
};

export default mongoose.models.Rate || mongoose.model('Rate', RateSchema);
